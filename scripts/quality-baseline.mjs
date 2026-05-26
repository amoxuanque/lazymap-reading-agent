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
      pass: 'fail',
      notes: `HTTP ${response.status}`,
    };
  }

  const summary = summaryLog || {};
  const budget = computeBudgetStatus(sample, summaryLog);

  return {
    sampleId: sample.sampleId,
    sourceKind: sample.sourceKind,
    expectedMode: sample.expectedMode,
    provider: payload.provider || summary.provider || null,
    mode: payload.mode || summary.mode || null,
    totalDurationMs: summary.totalDurationMs ?? null,
    fallbackUsed: summary.fallbackUsed ?? null,
    fallbackReasonType: summary.fallbackReasonType ?? null,
    pass: budget.pass,
    notes: budget.notes,
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
