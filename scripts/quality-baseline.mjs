import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const samples = JSON.parse(
  readFileSync(path.join(rootDir, 'tests/fixtures/quality/samples.json'), 'utf8'),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate a free port.'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function parseApiLogLines(buffer) {
  return String(buffer || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[api] '))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitForHealth(port, logsRef, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }

  throw new Error(`Server did not become ready in time. Last error: ${String(lastError)}\n${logsRef.value}`);
}

async function startServer() {
  const port = await getFreePort();
  const logsRef = { value: '' };
  const child = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: process.env.NODE_ENV || 'test',
      ALLOW_PROTOTYPE_FALLBACK: process.env.ALLOW_PROTOTYPE_FALLBACK || 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    logsRef.value += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logsRef.value += chunk.toString();
  });

  await waitForHealth(port, logsRef);
  return { child, logsRef, port };
}

async function stopServer(serverHandle) {
  if (!serverHandle?.child || serverHandle.child.killed) {
    return;
  }

  serverHandle.child.kill('SIGTERM');
  await new Promise((resolve) => {
    serverHandle.child.once('exit', () => resolve());
    setTimeout(resolve, 2000);
  });
}

async function waitForRequestLogs(logsRef, requestId, expectedEvent, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const entries = parseApiLogLines(logsRef.value);
    const match = entries.find((entry) => entry.requestId === requestId && entry.event === expectedEvent);
    if (match) {
      return match;
    }
    await sleep(80);
  }

  return null;
}

function buildGeneratePayload(sample) {
  if (sample.sourceKind === 'upload') {
    const content = readFileSync(path.join(rootDir, sample.fixturePath), 'utf8');
    return {
      title: sample.title,
      sourceKind: 'upload',
      content,
    };
  }

  return {
    title: sample.title,
    author: sample.author,
    sourceKind: 'catalog',
  };
}

function computeBudgetStatus(sample, summaryLog) {
  if (!summaryLog) {
    return { pass: 'fail', notes: 'missing generate_map_summary log' };
  }

  const totalDurationMs = Number(summaryLog.totalDurationMs || 0);
  const sourceKind = sample.sourceKind;
  const warningThresholdMs = 30000;
  const preferredThresholdMs = sourceKind === 'upload' ? 20000 : 25000;

  if (totalDurationMs > warningThresholdMs) {
    return { pass: 'warn', notes: `totalDurationMs ${totalDurationMs} exceeds warning threshold ${warningThresholdMs}` };
  }

  if (totalDurationMs > preferredThresholdMs) {
    return { pass: 'warn', notes: `totalDurationMs ${totalDurationMs} exceeds preferred threshold ${preferredThresholdMs}` };
  }

  if (summaryLog.fallbackUsed) {
    return { pass: 'warn', notes: `fallbackUsed=${summaryLog.fallbackReason || 'unknown'}` };
  }

  return { pass: 'pass', notes: 'within preferred budget' };
}

const internalLeakPattern = /(catalog 模式|prototype[-\s]?fallback|partial[-\s]?fallback|\bseed\b|\bprompt\b|quote 统一处理|回原书确认)/i;
const repeatedTemplatePattern = /(是进入这本书的一段核心阅读模块|先用.?判断这一部分值得读什么|围绕.+相关章节优先精读|回到原书确认|回原书核对)/g;
const genericTitlePattern = /^(问题定义|结构展开|方法提炼|阅读路线|核心观点|主要内容|关键判断|主题入口|阅读判断框架|公开结构线索)$/;
const actionMethodPattern = /^(先|再|把|别|用|沿着|盯住|顺着|拆开|分清|识别|确认|看)/;

function collectVisibleStrings(map) {
  const strings = [];
  const push = (value) => {
    if (!value || typeof value !== 'string') {
      return;
    }
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      strings.push(cleaned);
    }
  };

  push(map?.oneLiner?.zh);
  push(map?.about?.zh);
  push(map?.readingPosition?.zh);
  push(map?.overview?.title);
  push(map?.overview?.subtitle);
  (map?.overview?.cards || []).forEach((card) => {
    push(card?.title);
    push(card?.desc);
    (card?.points || []).forEach(push);
  });
  (map?.knowledgeMap?.areas || []).forEach((area) => {
    push(area?.title);
    push(area?.desc);
  });
  (map?.knowledgeMap?.tools || []).forEach((tool) => {
    push(tool?.title);
    push(tool?.desc);
    (tool?.points || []).forEach(push);
  });
  (map?.parts || []).forEach((part) => {
    push(part?.title);
    push(part?.navDesc);
    push(part?.intro);
    push(part?.task);
    push(part?.position);
    (part?.takeaways || []).forEach(push);
    (part?.chapters || []).forEach(push);
  });
  (map?.methods?.items || []).forEach((item) => {
    push(item?.title);
    push(item?.desc);
  });
  (map?.timeline || []).forEach((item) => {
    push(item?.title);
    push(item?.desc);
  });
  (map?.quotes || []).forEach((item) => {
    push(item?.quote);
    push(item?.note);
  });
  (map?.debates || []).forEach((item) => {
    push(item?.title);
    push(item?.value);
    push(item?.reservation);
  });
  (map?.routes || []).forEach((item) => {
    push(item?.audience);
    push(item?.route);
    (item?.focus || []).forEach(push);
  });

  return strings;
}

function assessCatalogObservations(map) {
  const visibleStrings = collectVisibleStrings(map);
  const joined = visibleStrings.join('\n');
  const partTitles = (map?.parts || []).map((part) => String(part?.title || '').trim()).filter(Boolean);
  const duplicatePartTitles = partTitles.length - new Set(partTitles.map((item) => item.toLowerCase())).size;
  const repeatedTemplateHits = (joined.match(repeatedTemplatePattern) || []).length + duplicatePartTitles;
  const internalLeakHits = visibleStrings.filter((line) => internalLeakPattern.test(line)).length;
  const specificSignals = [
    ...(map?.parts || []).map((item) => item?.title),
    ...(map?.timeline || []).map((item) => item?.title),
    ...(map?.parts || []).flatMap((item) => item?.chapters || []),
  ]
    .map((item) => String(item || '').trim())
    .filter((item) => item.length >= 5 && !genericTitlePattern.test(item));
  const strongRoutes = (map?.routes || []).filter((item) => String(item?.route || '').trim().length >= 18 && Array.isArray(item?.focus) && item.focus.length >= 2).length;
  const strongMethods = (map?.methods?.items || []).filter((item) => actionMethodPattern.test(String(item?.title || '')) && String(item?.desc || '').trim().length >= 24).length;
  const strongDebates = (map?.debates || []).filter((item) => String(item?.reservation || '').match(/误读|边界|代价|条件|保留|但|然而/) && String(item?.reservation || '').trim().length >= 18).length;
  const knowledgeToolCount = map?.knowledgeMap?.tools?.length || 0;
  const timelineCount = map?.timeline?.length || 0;
  const debateCount = map?.debates?.length || 0;
  const routeCount = map?.routes?.length || 0;
  const methodItemCount = map?.methods?.items?.length || 0;
  const fullDensityCoverage =
    (map?.overview?.cards?.length || 0) >= 4 &&
    (map?.knowledgeMap?.areas?.length || 0) >= 4 &&
    knowledgeToolCount >= 4 &&
    (map?.parts?.length || 0) >= 4 &&
    methodItemCount >= 10 &&
    timelineCount >= 4 &&
    (map?.quotes?.length || 0) >= 3 &&
    debateCount >= 2 &&
    routeCount >= 3
      ? 'pass'
      : (
          knowledgeToolCount >= 4 &&
          methodItemCount >= 8 &&
          timelineCount >= 4 &&
          debateCount >= 2 &&
          routeCount >= 2
            ? 'partial'
            : 'thin'
        );

  return {
    knowledgeToolCount,
    timelineCount,
    debateCount,
    routeCount,
    methodItemCount,
    fullDensityCoverage,
    repeatedTemplateRisk: repeatedTemplateHits >= 4 ? 'high' : (repeatedTemplateHits >= 2 ? 'medium' : 'low'),
    internalLeakRisk: internalLeakHits >= 2 ? 'high' : (internalLeakHits === 1 ? 'possible' : 'none'),
    specificityLevel: specificSignals.length >= 8 ? 'high' : (specificSignals.length >= 5 ? 'medium' : 'low'),
    routeQuality: strongRoutes >= 3 ? 'strong' : (strongRoutes >= 2 ? 'ok' : 'weak'),
    methodQuality: strongMethods >= 8 ? 'strong' : (strongMethods >= 4 ? 'ok' : 'weak'),
    misreadRiskCoverage: strongDebates >= 2 ? 'strong' : (strongDebates >= 1 ? 'ok' : 'weak'),
  };
}

function buildGenerateRow(sample, response, payload, summaryLog) {
  if (!response.ok) {
    return {
      sampleId: sample.sampleId,
      sourceKind: sample.sourceKind,
      expectedMode: sample.expectedMode,
      provider: null,
      mode: null,
      totalDurationMs: null,
      fallbackUsed: null,
      fallbackReasonType: null,
      knowledgeToolCount: null,
      timelineCount: null,
      debateCount: null,
      routeCount: null,
      methodItemCount: null,
      fullDensityCoverage: null,
      repeatedTemplateRisk: null,
      internalLeakRisk: null,
      specificityLevel: null,
      routeQuality: null,
      methodQuality: null,
      misreadRiskCoverage: null,
      pass: 'fail',
      notes: `HTTP ${response.status}`,
    };
  }

  const summary = summaryLog || {};
  const budget = computeBudgetStatus(sample, summaryLog);
  const observations = sample.sourceKind === 'catalog' ? assessCatalogObservations(payload.map || {}) : {
    knowledgeToolCount: 'n/a',
    timelineCount: 'n/a',
    debateCount: 'n/a',
    routeCount: 'n/a',
    methodItemCount: 'n/a',
    fullDensityCoverage: 'n/a',
    repeatedTemplateRisk: 'n/a',
    internalLeakRisk: 'n/a',
    specificityLevel: 'n/a',
    routeQuality: 'n/a',
    methodQuality: 'n/a',
    misreadRiskCoverage: 'n/a',
  };
  const warningNotes = [];
  if (observations.internalLeakRisk === 'high' || observations.repeatedTemplateRisk === 'high') {
    warningNotes.push('content-risk-high');
  }
  if (observations.specificityLevel === 'low') {
    warningNotes.push('specificity-low');
  }

  return {
    sampleId: sample.sampleId,
    sourceKind: sample.sourceKind,
    expectedMode: sample.expectedMode,
    provider: payload.provider || summary.provider || null,
    mode: payload.mode || summary.mode || null,
    totalDurationMs: summary.totalDurationMs ?? null,
    fallbackUsed: summary.fallbackUsed ?? null,
    fallbackReasonType: summary.fallbackReasonType ?? null,
    knowledgeToolCount: observations.knowledgeToolCount,
    timelineCount: observations.timelineCount,
    debateCount: observations.debateCount,
    routeCount: observations.routeCount,
    methodItemCount: observations.methodItemCount,
    fullDensityCoverage: observations.fullDensityCoverage,
    repeatedTemplateRisk: observations.repeatedTemplateRisk,
    internalLeakRisk: observations.internalLeakRisk,
    specificityLevel: observations.specificityLevel,
    routeQuality: observations.routeQuality,
    methodQuality: observations.methodQuality,
    misreadRiskCoverage: observations.misreadRiskCoverage,
    pass: budget.pass,
    notes: [budget.notes, ...warningNotes].filter(Boolean).join(' | '),
  };
}

async function runGenerateSample(sample, serverHandle) {
  const response = await fetch(`http://127.0.0.1:${serverHandle.port}/api/generate-map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildGeneratePayload(sample)),
  });
  const payload = await response.json().catch(() => ({}));
  const requestId = response.headers.get('x-request-id');
  const summaryLog = requestId
    ? await waitForRequestLogs(serverHandle.logsRef, requestId, 'generate_map_summary')
    : null;

  return buildGenerateRow(sample, response, payload, summaryLog);
}

async function runShareSample(sample, serverHandle) {
  const mapFixture = JSON.parse(readFileSync(path.join(rootDir, sample.fixturePath), 'utf8'));
  const createResponse = await fetch(`http://127.0.0.1:${serverHandle.port}/api/share-map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ map: mapFixture }),
  });
  const createPayload = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok || !createPayload.shareId) {
    return {
      sampleId: sample.sampleId,
      sourceKind: 'share',
      expectedMode: sample.expectedMode,
      provider: null,
      mode: null,
      totalDurationMs: null,
      fallbackUsed: null,
      fallbackReasonType: null,
      knowledgeToolCount: 'n/a',
      timelineCount: 'n/a',
      debateCount: 'n/a',
      routeCount: 'n/a',
      methodItemCount: 'n/a',
      fullDensityCoverage: 'n/a',
      repeatedTemplateRisk: 'n/a',
      internalLeakRisk: 'n/a',
      specificityLevel: 'n/a',
      routeQuality: 'n/a',
      methodQuality: 'n/a',
      misreadRiskCoverage: 'n/a',
      pass: 'fail',
      notes: 'share create failed',
    };
  }

  const readResponse = await fetch(`http://127.0.0.1:${serverHandle.port}/api/share-map/${createPayload.shareId}`);
  const readPayload = await readResponse.json().catch(() => ({}));
  const requestId = readResponse.headers.get('x-request-id');
  const completedLog = requestId
    ? await waitForRequestLogs(serverHandle.logsRef, requestId, 'request_completed')
    : null;

  return {
    sampleId: sample.sampleId,
    sourceKind: 'share',
    expectedMode: sample.expectedMode,
    provider: null,
    mode: null,
    totalDurationMs: completedLog?.durationMs ?? null,
    fallbackUsed: false,
    fallbackReasonType: null,
    knowledgeToolCount: 'n/a',
    timelineCount: 'n/a',
    debateCount: 'n/a',
    routeCount: 'n/a',
    methodItemCount: 'n/a',
    fullDensityCoverage: 'n/a',
    repeatedTemplateRisk: 'n/a',
    internalLeakRisk: 'n/a',
    specificityLevel: 'n/a',
    routeQuality: 'n/a',
    methodQuality: 'n/a',
    misreadRiskCoverage: 'n/a',
    pass: readResponse.ok && readPayload?.map?.id === mapFixture.id ? 'pass' : 'fail',
    notes: readResponse.ok && readPayload?.map?.id === mapFixture.id
      ? 'share read stable'
      : 'share read mismatch',
  };
}

async function main() {
  const serverHandle = await startServer();

  try {
    const results = [];

    for (const sample of samples) {
      if (sample.kind === 'generate') {
        results.push(await runGenerateSample(sample, serverHandle));
      } else if (sample.kind === 'share') {
        results.push(await runShareSample(sample, serverHandle));
      }
    }

    console.log('Quality baseline results:\n');
    console.table(results);
    console.log('\nNotes:');
    console.log('- This command is observational and is not part of check:release.');
    console.log('- Without a real SiliconFlow key, generate samples may warn due to prototype fallback.');
    console.log('- Manual content scoring should be recorded against docs/QUALITY-BASELINE.md.');
  } finally {
    await stopServer(serverHandle);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
