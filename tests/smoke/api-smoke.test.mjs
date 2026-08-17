import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const leverFixture = JSON.parse(
  readFileSync(path.join(rootDir, 'tests/fixtures/search-books/the-lever-of-riches.json'), 'utf8'),
);
const shareMapFixture = JSON.parse(
  readFileSync(path.join(rootDir, 'tests/fixtures/share-map.json'), 'utf8'),
);
const uploadSample = readFileSync(path.join(rootDir, 'tests/fixtures/upload-sample.txt'), 'utf8');
const gutenbergUploadSample = `The Project Gutenberg eBook of 回归样本

Title: 回归样本
Author: 测试作者

*** START OF THE PROJECT GUTENBERG EBOOK 回归样本 ***

Produced by Regression Test

第一章 先识别约束

复杂系统不是元素堆叠，而是约束关系决定整体行为。理解正文时，应先确认问题如何被提出。

第二章 再寻找转折

有效阅读需要追踪作者反复回到的问题，并观察中段如何改变开场判断。

第三章 提炼方法

方法不能脱离证据，必须回到相邻段落确认条件、动作和适用边界。

第四章 安排路线

阅读路线应从主问题进入，经过结构转折，最后回到结尾检查全书如何收束。

*** END OF THE PROJECT GUTENBERG EBOOK 回归样本 ***

Project Gutenberg License`;

let appPort = 0;
let stubPort = 0;
let serverProcess;
let stubServer;
let serverLogs = '';

const catalogRoutePattern = /(先看|进入|判断|决定是否深读|再决定|读前|入口|重点读|顺着|沿着)/;
const pseudoDeepReadPattern = /(基于正文|原文明确证明|原文证明|全书完整论证)/;
const uploadRoutePattern = /(先看|再看|最后|回到正文|章节|结构推进|顺着正文|按正文结构)/;
const genericUploadPartTitlePattern = /^(问题定义|结构展开|方法提炼|阅读路线)$/;

function getJson(response) {
  return response.json();
}

function appendLog(chunk) {
  serverLogs += chunk.toString();
}

async function waitForLogsToFlush() {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

function collectCatalogGuideTexts(map) {
  return [
    map?.about?.zh,
    ...(map?.overview?.cards || []).flatMap((card) => [card?.title, card?.desc]),
    ...(map?.debates || []).flatMap((item) => [item?.title, item?.value, item?.reservation]),
  ].filter(Boolean).join('\n');
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

async function startServer(overrides = {}) {
  const port = await getFreePort();
  const logs = { value: '' };
  const processHandle = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      ALLOW_PROTOTYPE_FALLBACK: 'true',
      SILICONFLOW_API_KEY: '',
      GEMINI_API_KEY: '',
      TAVILY_API_KEY: '',
      GOOGLE_BOOKS_BASE_URL: `http://127.0.0.1:${stubPort}/google`,
      OPEN_LIBRARY_BASE_URL: `http://127.0.0.1:${stubPort}/openlibrary`,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  processHandle.stdout.on('data', (chunk) => {
    logs.value += chunk.toString();
  });
  processHandle.stderr.on('data', (chunk) => {
    logs.value += chunk.toString();
  });

  await waitForServer(`http://127.0.0.1:${port}/api/health`, 10000, () => logs.value);

  return { port, processHandle, logs };
}

async function stopServer(handle) {
  if (!handle || !handle.processHandle || handle.processHandle.killed) {
    return;
  }

  handle.processHandle.kill('SIGTERM');
  await new Promise((resolve) => {
    handle.processHandle.once('exit', () => resolve());
    setTimeout(() => resolve(), 2000);
  });
}

async function waitForServer(url, timeoutMs = 10000, getLogs = () => serverLogs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become ready in time. Last error: ${String(lastError)}\n${getLogs()}`);
}

function createSiliconFlowStubServer(compactContent) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.method === 'POST' && url.pathname === '/chat/completions') {
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: compactContent,
            },
          },
        ],
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

function createSequencedSiliconFlowStubServer(contents, requests) {
  let callIndex = 0;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'POST' && url.pathname === '/chat/completions') {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push(JSON.parse(body));
      const content = contents[Math.min(callIndex, contents.length - 1)];
      callIndex += 1;
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

function createStubServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://127.0.0.1:${stubPort}`);
    const query = url.searchParams.get('q') || '';
    const normalizedQuery = query.toLowerCase();

    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (url.pathname === '/google') {
      const payload = normalizedQuery.includes('the lever of riches')
        ? leverFixture.google
        : { items: [] };
      response.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/openlibrary') {
      const payload = normalizedQuery.includes('the lever of riches')
        ? leverFixture.openLibrary
        : { docs: [] };
      response.end(JSON.stringify(payload));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

before(async () => {
  appPort = await getFreePort();
  stubPort = await getFreePort();
  stubServer = createStubServer();

  await new Promise((resolve, reject) => {
    stubServer.listen(stubPort, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  serverProcess = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      NODE_ENV: 'test',
      ALLOW_PROTOTYPE_FALLBACK: 'true',
      SILICONFLOW_API_KEY: '',
      GEMINI_API_KEY: '',
      TAVILY_API_KEY: '',
      GOOGLE_BOOKS_BASE_URL: `http://127.0.0.1:${stubPort}/google`,
      OPEN_LIBRARY_BASE_URL: `http://127.0.0.1:${stubPort}/openlibrary`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', appendLog);
  serverProcess.stderr.on('data', appendLog);

  await waitForServer(`http://127.0.0.1:${appPort}/api/health`);
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    await new Promise((resolve) => {
      serverProcess.once('exit', () => resolve());
      setTimeout(() => resolve(), 2000);
    });
  }

  if (stubServer) {
    await new Promise((resolve, reject) => {
      stubServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('/api/health returns release-critical config fields', async () => {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, 'prototype-fallback');
  assert.equal(payload.tavily, false);
  assert.equal(payload.config.allowPrototypeFallback, true);
  assert.equal(payload.config.tavilyConfigured, false);
  assert.equal(typeof payload.model, 'string');
  assert.equal(payload.live, true);
  assert.equal(payload.ready, false);
  assert.equal(payload.status, 'unconfigured');
  assert.equal(payload.dependencies.siliconflow.configured, false);
  assert.equal(Array.isArray(payload.diagnostics.issues), true);
});

test('/api/ready reports unconfigured when formal generation is unavailable', async () => {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/ready`);
  const payload = await getJson(response);

  assert.equal(response.status, 503);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(payload.ok, false);
  assert.equal(payload.live, true);
  assert.equal(payload.ready, false);
  assert.equal(payload.status, 'unconfigured');
  assert.equal(payload.provider, 'prototype-fallback');
  assert.equal(payload.config.allowPrototypeFallback, true);
  assert.equal(payload.dependencies.prototypeFallback.enabled, true);
});

test('/api/ready reports degraded but ready when formal generation is configured and optional deps are missing', async () => {
  const degradedServer = await startServer({
    SILICONFLOW_API_KEY: 'YOUR_SILICONFLOW_API_KEY',
    ALLOW_PROTOTYPE_FALLBACK: 'false',
    TAVILY_API_KEY: '',
  });

  try {
    const response = await fetch(`http://127.0.0.1:${degradedServer.port}/api/ready`);
    const payload = await getJson(response);

    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
    assert.equal(payload.ok, true);
    assert.equal(payload.live, true);
    assert.equal(payload.ready, true);
    assert.equal(payload.status, 'degraded');
    assert.equal(payload.provider, 'siliconflow');
    assert.equal(payload.dependencies.siliconflow.configured, true);
    assert.equal(payload.dependencies.tavily.configured, false);
    assert.ok(payload.diagnostics.degradedReasons.includes('tavily_unconfigured'));
  } finally {
    await stopServer(degradedServer);
  }
});

test('/api/search-books handles empty and unusual queries without crashing', async () => {
  const emptyResponse = await fetch(`http://127.0.0.1:${appPort}/api/search-books`);
  const emptyPayload = await getJson(emptyResponse);

  assert.equal(emptyResponse.status, 200);
  assert.ok(Array.isArray(emptyPayload.results));
  assert.ok(emptyPayload.results.some((item) => item.title === 'The Book of Elon'));

  const oddResponse = await fetch(`http://127.0.0.1:${appPort}/api/search-books?q=${encodeURIComponent('%%%')}`);
  const oddPayload = await getJson(oddResponse);

  assert.equal(oddResponse.status, 200);
  assert.ok(Array.isArray(oddPayload.results));
});

test('/api/search-books returns curated author metadata for Chinese seed titles', async () => {
  const response = await fetch(
    `http://127.0.0.1:${appPort}/api/search-books?q=${encodeURIComponent('思考快与慢')}`,
  );
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.results));
  assert.ok(payload.results.length > 0);
  assert.equal(payload.results[0].author, 'Daniel Kahneman');
  assert.match(payload.results[0].title, /思考.*Thinking, Fast and Slow/);
});

test('/api/search-books returns curated author metadata for Siddhartha', async () => {
  const response = await fetch(
    `http://127.0.0.1:${appPort}/api/search-books?q=${encodeURIComponent('悉达多')}`,
  );
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.results));
  assert.ok(payload.results.length > 0);
  assert.equal(payload.results[0].author, 'Hermann Hesse');
  assert.match(payload.results[0].title, /悉达多.*Siddhartha/);
});

test('/api/search-books does not mismatch The Lever of Riches with The Book of Elon', async () => {
  const response = await fetch(
    `http://127.0.0.1:${appPort}/api/search-books?q=${encodeURIComponent('The Lever of Riches')}`,
  );
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload.results));
  assert.ok(payload.results.length > 0);
  assert.equal(payload.results[0].title, 'The Lever of Riches');
  assert.ok(payload.results.every((item) => item.title !== 'The Book of Elon'));
});

test('/api/generate-map supports catalog smoke without external model keys', async () => {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/generate-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'The Lever of Riches',
      author: 'Joel Mokyr',
      sourceKind: 'catalog',
    }),
  });
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(payload.provider, 'prototype-fallback');
  assert.equal(payload.mode, 'prototype-fallback');
  assert.equal(payload.map.title, 'The Lever of Riches');
  assert.equal(payload.map.sourceMeta.mode, 'prototype-fallback');
  assert.equal(payload.map.sourceMeta.productType, 'pre-reading-guide');
  assert.equal(payload.map.sourceMeta.sourceBasis, 'public-grounding');
  assert.equal(payload.map.sourceMeta.confidenceLabel, '基于公开资料整理');
  assert.equal(payload.map.sourceMeta.disclaimer, '用于读前判断和阅读路线规划，不等同于原书全文精读');
  assert.ok(payload.map.quotes.every((item) => item.quote.startsWith('关键判断：')));
  assert.ok(payload.map.routes.every((item) => catalogRoutePattern.test(item.route)));
  assert.equal(payload.map.routes.some((item) => /\b(oneLiner|about|parts|routes)\b/i.test(item.route)), false);
  assert.equal(pseudoDeepReadPattern.test(collectCatalogGuideTexts(payload.map)), false);
});

test('/api/generate-map supports upload smoke without external model keys', async () => {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/generate-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '上传样本',
      sourceKind: 'upload',
      content: uploadSample,
    }),
  });
  const payload = await getJson(response);

  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(payload.provider, 'prototype-fallback');
  assert.equal(payload.mode, 'prototype-fallback');
  assert.equal(payload.map.title, '上传样本');
  assert.equal(payload.map.author, '上传文件');
  assert.equal(payload.map.sourceMeta.kind, 'upload');
  assert.equal(payload.map.sourceMeta.productType, 'deep-reading-map');
  assert.equal(/fallback|quotes=/.test(payload.map.sourceMeta.summary), false);
  assert.ok(payload.map.parts.length >= 4);
  assert.ok(payload.map.methods.items.length >= 8);
  assert.ok(payload.map.routes.length >= 3);
  assert.equal(payload.map.parts.some((item) => genericUploadPartTitlePattern.test(item.title)), false);
  assert.ok(payload.map.routes.every((item) => uploadRoutePattern.test(item.route)));
  await waitForLogsToFlush();
  assert.equal(serverLogs.includes('generate_map_summary'), true);
  assert.equal(serverLogs.includes('复杂系统不是把元素堆起来'), false);
  assert.equal(serverLogs.includes('真正有效的阅读，不是尽快得到结论'), false);
  assert.equal(serverLogs.includes('Output valid JSON only.'), false);
  assert.equal(serverLogs.includes('YOUR_SILICONFLOW_API_KEY'), false);
});

test('/api/generate-map sanitizes ebook boilerplate and keeps fallback maps render-safe', async () => {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/generate-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '回归样本',
      author: '测试作者',
      sourceKind: 'upload',
      content: gutenbergUploadSample,
    }),
  });
  const payload = await getJson(response);
  const visiblePayload = JSON.stringify(payload.map);

  assert.equal(response.status, 200);
  assert.equal(payload.map.sourceMeta.productType, 'deep-reading-map');
  assert.equal(/Project Gutenberg|Produced by|Title:|Author:/.test(visiblePayload), false);
  assert.ok(payload.map.parts.every((part) => part.intro.length <= 1200));
  assert.ok(payload.map.parts.flatMap((part) => part.takeaways).every((item) => typeof item === 'string'));
  assert.ok(payload.map.parts.flatMap((part) => part.chapters).every((item) => typeof item === 'string'));
  assert.ok(Buffer.byteLength(visiblePayload, 'utf8') < 100_000);
});

test('/api/generate-map repairs malformed upload compact seeds and stays source-grounded', async () => {
  const compactContent = `{"oneLiner":"复杂系统先看约束","about":"先看约束如何决定行为","overview1":"先看约束","overview2":"再看反复问题","part1":"约束决定行为","part2":"反复问题决定结构","method1":"先找约束","method2":"再找重复问题","quote1":"关键判断：复杂系统不是把元素堆起来，而是先看约束如何决定行为。","route1":"先看约束再看结构"`;
  const siliconFlowPort = await getFreePort();
  const siliconFlowStub = createSiliconFlowStubServer(compactContent);

  await new Promise((resolve, reject) => {
    siliconFlowStub.listen(siliconFlowPort, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const repairedServer = await startServer({
    SILICONFLOW_API_KEY: 'YOUR_SILICONFLOW_API_KEY',
    SILICONFLOW_BASE_URL: `http://127.0.0.1:${siliconFlowPort}`,
  });

  try {
    const response = await fetch(`http://127.0.0.1:${repairedServer.port}/api/generate-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '上传样本',
        sourceKind: 'upload',
        content: uploadSample,
      }),
    });
    const payload = await getJson(response);

    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
    assert.equal(payload.provider, 'siliconflow');
    assert.equal(payload.mode, 'source-grounded');
    assert.equal(payload.map.sourceMeta.kind, 'upload');
    assert.equal(payload.map.sourceMeta.mode, 'source-grounded');
    assert.equal(payload.map.sourceMeta.productType, 'deep-reading-map');
    assert.ok(payload.map.parts.length >= 4);
    assert.ok(payload.map.methods.items.length >= 8);
    assert.ok(payload.map.routes.length >= 3);
    assert.equal(payload.map.parts.some((item) => genericUploadPartTitlePattern.test(item.title)), false);
    assert.ok(payload.map.routes.every((item) => uploadRoutePattern.test(item.route)));

    await waitForLogsToFlush();
    assert.equal(repairedServer.logs.value.includes('generate_map_summary'), true);
    assert.equal(repairedServer.logs.value.includes('"provider":"prototype-fallback"'), false);
    assert.equal(repairedServer.logs.value.includes('复杂系统不是把元素堆起来'), false);
    assert.equal(repairedServer.logs.value.includes('Output valid JSON only.'), false);
    assert.equal(repairedServer.logs.value.includes('YOUR_SILICONFLOW_API_KEY'), false);
  } finally {
    await stopServer(repairedServer);
    await new Promise((resolve, reject) => {
      siliconFlowStub.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('/api/generate-map samples the full chapter range and retries repetitive upload maps', async () => {
  const chapterTopics = [
    '约束如何形成', '资源怎样配置', '联盟为何变化', '冲突如何升级', '制度怎样固化',
    '例外如何暴露', '反馈怎样回流', '边界如何移动', '选择怎样收束', '结尾如何验证',
  ];
  const longUpload = chapterTopics.map((topic, index) => (
    `第${index + 1}章 ${topic}\n\n${`${topic}不是孤立结论，而是第${index + 1}章用案例、条件和反例推进的具体判断。读者需要辨认本章的前提、动作、结果与适用边界。`.repeat(18)}`
  )).join('\n\n');
  const repetitiveSeed = JSON.stringify({
    oneLiner: '把章节压成推进链',
    about: '全书通过多个章节展开判断。',
    overview: ['推进判断1', '推进判断2', '推进判断3', '推进判断4'],
    parts: chapterTopics.slice(0, 4).map((topic) => ({
      title: topic,
      summary: `${topic}是进入这本书的一段核心阅读模块。`,
      judgment: `先判断${topic}这一部分值得读什么。`,
      role: `${topic}帮助读者放回整本书的推进链里。`,
      takeaways: ['相同判断一', '相同判断二', '相同判断三'],
      chapters: [`第1章 ${chapterTopics[0]}`],
    })),
    methods: Array.from({ length: 8 }, (_, index) => ({ category: '判断', title: `判断${index + 1}`, desc: '具体观察点，用来把抽象观点落成可操作的判断动作。' })),
    quotes: Array.from({ length: 4 }, (_, index) => ({ quote: `关键判断：样本${index + 1}`, note: '对应正文中的判断价值。' })),
    routes: Array.from({ length: 3 }, (_, index) => ({ audience: `读者${index + 1}`, route: '先看章节，再看结构推进，最后回到正文。', focus: ['章节', '结构'] })),
  });
  const improvedSeed = JSON.stringify({
    oneLiner: '制度选择在反馈中逐步收束',
    about: '全书从约束和资源起步，经联盟、冲突与制度固化进入中段，再借例外、反馈和边界变化校正判断，最终讨论选择及其验证。',
    overview: [
      { title: '先确认约束与资源', desc: '开篇先界定行动空间，再解释资源配置如何改变可选路径。', points: ['约束', '资源', '路径'] },
      { title: '再追踪联盟与冲突', desc: '中前段把关系变化与冲突升级连起来，展示局部选择的代价。', points: ['联盟', '冲突', '代价'] },
      { title: '用例外检验制度', desc: '中后段通过例外和反馈暴露固化制度无法解释的边界。', points: ['制度', '例外', '反馈'] },
      { title: '最后收束选择', desc: '结尾把移动边界、最终选择与验证条件放进同一判断链。', points: ['边界', '选择', '验证'] },
    ],
    parts: [
      { title: '约束先于资源选择', navDesc: '开篇先说明行动空间如何被约束，再讨论资源配置为何不能脱离前提。', task: '区分不可改变的约束与仍可重新配置的资源。', position: '它建立后续联盟与冲突分析共同依赖的起点。', takeaways: ['先列约束', '再看资源', '确认路径'], chapters: ['第1章 约束如何形成', '第2章 资源怎样配置'] },
      { title: '联盟变化推动冲突升级', navDesc: '关系变化不是背景信息，而是解释冲突为何升级的中前段机制。', task: '沿人物与利益关系识别冲突从潜在变成显性的节点。', position: '它把静态条件推向动态博弈，并为制度固化提供原因。', takeaways: ['追踪联盟', '定位冲突', '识别代价'], chapters: ['第3章 联盟为何变化', '第4章 冲突如何升级'] },
      { title: '制度固化要经受例外检验', navDesc: '中段先展示规则稳定性，再用无法被规则吸收的例外揭示其局限。', task: '对照常规案例与例外案例，判断制度解释力的真实边界。', position: '它完成从制度有效性到制度局限性的关键转折。', takeaways: ['识别固化', '寻找例外', '划出边界'], chapters: ['第5章 制度怎样固化', '第6章 例外如何暴露'] },
      { title: '反馈重画边界并收束选择', navDesc: '后段把反馈结果带回前提，解释边界移动后哪些选择仍然成立。', task: '用反馈修正最初判断，并核对结尾给出的验证条件。', position: '它连接修正、选择与验证，完成全书论证闭环。', takeaways: ['读取反馈', '重画边界', '验证选择'], chapters: ['第7章 反馈怎样回流', '第8章 边界如何移动', '第9章 选择怎样收束', '第10章 结尾如何验证'] },
    ],
    methods: chapterTopics.slice(0, 8).map((topic, index) => ({ category: index < 4 ? '结构识别' : '证据校验', title: `${topic}时核对前提`, desc: `回到第${index + 1}章的正文案例，分别标记前提、动作、结果和反例，再判断结论适用到哪里。` })),
    quotes: Array.from({ length: 4 }, (_, index) => ({ quote: `关键判断：章节证据决定结论边界${index + 1}`, note: `对应第${index + 1}章的条件与反例。` })),
    routes: [
      { audience: '先搭骨架的读者', route: '先看前两章的约束与资源，再看联盟和冲突怎样推进结构。', focus: ['约束资源', '联盟冲突'] },
      { audience: '重视证据的读者', route: '先看制度章节，再看例外与反馈，最后回到正文核对边界。', focus: ['制度例外', '反馈边界'] },
      { audience: '准备精读的读者', route: '按章节顺序读到选择收束，最后用结尾验证前面各段判断。', focus: ['选择收束', '结尾验证'] },
    ],
  });
  const requests = [];
  const siliconFlowPort = await getFreePort();
  const siliconFlowStub = createSequencedSiliconFlowStubServer([repetitiveSeed, improvedSeed], requests);
  await new Promise((resolve) => siliconFlowStub.listen(siliconFlowPort, '127.0.0.1', resolve));
  const qualityServer = await startServer({
    SILICONFLOW_API_KEY: 'YOUR_SILICONFLOW_API_KEY',
    SILICONFLOW_BASE_URL: `http://127.0.0.1:${siliconFlowPort}`,
  });

  try {
    const response = await fetch(`http://127.0.0.1:${qualityServer.port}/api/generate-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '长文本质量回归', sourceKind: 'upload', content: longUpload }),
    });
    const payload = await getJson(response);
    assert.equal(response.status, 200, `${JSON.stringify(payload)}\n${qualityServer.logs.value}`);
    assert.equal(requests.length, 2);
    assert.match(requests[0].messages.map((message) => message.content).join('\n'), /第10章 结尾如何验证/);
    assert.match(requests[1].messages.map((message) => message.content).join('\n'), /schema 占位词/);
    assert.ok(payload.map.parts.every((part) => part.sourceEvidence?.length >= 1));
    assert.ok(payload.map.methods.items.every((item) => item.sourceEvidence?.length >= 1));
    assert.ok(payload.map.routes.every((route) => route.sourceEvidence?.length >= 1));
    assert.equal(JSON.stringify(payload.map).includes('是进入这本书的一段核心阅读模块'), false);
    assert.ok(new Set(payload.map.parts.flatMap((part) => part.sourceEvidence.map((item) => item.chapter))).size >= 4);
  } finally {
    await stopServer(qualityServer);
    await new Promise((resolve) => siliconFlowStub.close(resolve));
  }
});

test('/api/generate-map repairs malformed catalog compact seeds with curated local seed data', async () => {
  const compactContent = `{"oneLoute": " ", "about": 4, "overview": ["模块"], "quotes": ["判断"]`;
  const siliconFlowPort = await getFreePort();
  const siliconFlowStub = createSiliconFlowStubServer(compactContent);

  await new Promise((resolve, reject) => {
    siliconFlowStub.listen(siliconFlowPort, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const repairedServer = await startServer({
    SILICONFLOW_API_KEY: 'YOUR_SILICONFLOW_API_KEY',
    SILICONFLOW_BASE_URL: `http://127.0.0.1:${siliconFlowPort}`,
  });

  try {
    const response = await fetch(`http://127.0.0.1:${repairedServer.port}/api/generate-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '思考快与慢',
        sourceKind: 'catalog',
      }),
    });
    const payload = await getJson(response);

    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
    assert.equal(payload.provider, 'siliconflow');
    assert.equal(payload.mode, 'title-only');
    assert.equal(payload.map.author, 'Daniel Kahneman');
    assert.match(payload.map.title, /思考.*Thinking, Fast and Slow/);
    assert.equal(payload.map.sourceMeta.productType, 'pre-reading-guide');
    assert.equal(payload.map.sourceMeta.sourceBasis, 'public-grounding');
    assert.equal(payload.map.sourceMeta.confidenceLabel, '基于公开资料整理');
    assert.equal(payload.map.sourceMeta.disclaimer, '用于读前判断和阅读路线规划，不等同于原书全文精读');
    assert.ok(payload.map.overview.cards.some((card) => /两套思维系统|偏误|慢思考/.test(card.title)));
    assert.ok(payload.map.quotes.every((item) => item.quote.startsWith('关键判断：')));
    assert.ok(payload.map.routes.every((item) => catalogRoutePattern.test(item.route)));
    assert.equal(pseudoDeepReadPattern.test(collectCatalogGuideTexts(payload.map)), false);
    assert.ok(payload.map.knowledgeMap.areas.length >= 4);
    assert.ok(payload.map.knowledgeMap.tools.length >= 4);
    assert.ok(payload.map.methods.items.length >= 10);
    assert.ok(payload.map.timeline.length >= 4);
    assert.ok(payload.map.quotes.length >= 3);
    assert.ok(payload.map.debates.length >= 2);
    assert.ok(payload.map.routes.length >= 3);

    await waitForLogsToFlush();
    assert.equal(repairedServer.logs.value.includes('"provider":"prototype-fallback"'), false);
  } finally {
    await stopServer(repairedServer);
    await new Promise((resolve, reject) => {
      siliconFlowStub.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('/api/generate-map uses curated Siddhartha seed instead of generic shell content', async () => {
  const compactContent = `{"oneLoute":" ","overview":["模块"],"quotes":["判断"]`;
  const siliconFlowPort = await getFreePort();
  const siliconFlowStub = createSiliconFlowStubServer(compactContent);

  await new Promise((resolve, reject) => {
    siliconFlowStub.listen(siliconFlowPort, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const repairedServer = await startServer({
    SILICONFLOW_API_KEY: 'YOUR_SILICONFLOW_API_KEY',
    SILICONFLOW_BASE_URL: `http://127.0.0.1:${siliconFlowPort}`,
  });

  try {
    const response = await fetch(`http://127.0.0.1:${repairedServer.port}/api/generate-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '悉达多',
        sourceKind: 'catalog',
      }),
    });
    const payload = await getJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.provider, 'siliconflow');
    assert.equal(payload.mode, 'title-only');
    assert.equal(payload.map.author, 'Hermann Hesse');
    assert.match(payload.map.title, /悉达多.*Siddhartha/);
    assert.equal(payload.map.sourceMeta.productType, 'pre-reading-guide');
    assert.equal(payload.map.sourceMeta.sourceBasis, 'public-grounding');
    assert.equal(payload.map.sourceMeta.confidenceLabel, '基于公开资料整理');
    assert.equal(payload.map.sourceMeta.disclaimer, '用于读前判断和阅读路线规划，不等同于原书全文精读');
    assert.equal(payload.map.oneLiner.zh, '觉悟不能靠抄别人的路');
    assert.deepEqual(
      payload.map.overview.cards.map((card) => card.title),
      ['先离开现成答案', '再让经验替代教条', '把尘世沉浮当成必经之路', '最后在倾听里明白万物同流'],
    );
    assert.deepEqual(
      payload.map.parts.map((part) => part.title),
      ['离家求道先否定继承答案', '遇见佛陀也不肯照抄觉悟', '在尘世里经历欲望财富与空虚', '回到河流前学会倾听与统一'],
    );
    assert.ok(payload.map.knowledgeMap.areas.length >= 4);
    assert.ok(payload.map.knowledgeMap.tools.length >= 4);
    assert.ok(payload.map.methods.items.length >= 10);
    assert.ok(payload.map.timeline.length >= 4);
    assert.ok(payload.map.quotes.length >= 3);
    assert.ok(payload.map.debates.length >= 2);
    assert.ok(payload.map.routes.length >= 3);
    assert.ok(payload.map.quotes.every((item) => item.quote.startsWith('关键判断：')));
    assert.ok(payload.map.routes.every((item) => catalogRoutePattern.test(item.route)));
    assert.equal(pseudoDeepReadPattern.test(collectCatalogGuideTexts(payload.map)), false);
    const catalogDensityTexts = [
      ...payload.map.knowledgeMap.areas.flatMap((area) => [area.title, area.desc]),
      ...payload.map.knowledgeMap.tools.flatMap((tool) => [tool.title, tool.desc, ...(tool.points || [])]),
      ...payload.map.timeline.flatMap((item) => [item.title, item.desc]),
      ...payload.map.debates.flatMap((item) => [item.title, item.value, item.reservation]),
      ...payload.map.routes.flatMap((item) => [item.audience, item.route, ...(item.focus || [])]),
    ].filter(Boolean).join('\n');
    assert.equal(/佛陀|河流|倾听|尘世|觉悟|欲望/.test(catalogDensityTexts), true);
    const visibleTexts = [
      payload.map.oneLiner?.zh,
      payload.map.about?.zh,
      payload.map.readingPosition?.zh,
      ...payload.map.overview.cards.flatMap((card) => [card.title, card.desc, ...(card.points || [])]),
      ...payload.map.knowledgeMap.areas.flatMap((area) => [area.title, area.desc]),
      ...payload.map.knowledgeMap.tools.flatMap((tool) => [tool.title, tool.desc, ...(tool.points || [])]),
      ...payload.map.parts.flatMap((part) => [
        part.title,
        part.navDesc,
        part.intro,
        part.task,
        part.position,
        ...(part.takeaways || []),
        ...(part.chapters || []),
      ]),
      ...payload.map.methods.items.flatMap((item) => [item.title, item.desc]),
      ...payload.map.timeline.flatMap((item) => [item.title, item.desc]),
      ...payload.map.quotes.flatMap((item) => [item.quote, item.note]),
      ...payload.map.debates.flatMap((item) => [item.title, item.value, item.reservation]),
      ...payload.map.routes.flatMap((item) => [item.route, ...(item.focus || [])]),
    ].filter(Boolean).join('\n');
    assert.equal(/catalog 模式|prototype[- ]?fallback|partial[- ]?fallback|\bseed\b|\bprompt\b|quote 统一处理/.test(visibleTexts), false);
    assert.equal(/回原书确认|回原书核对|是进入这本书的一段核心阅读模块|先用.?判断这一部分值得读什么/.test(visibleTexts), false);
  } finally {
    await stopServer(repairedServer);
    await new Promise((resolve, reject) => {
      siliconFlowStub.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('/api/share-map creates and reads share ids, and invalid ids return 404', async () => {
  const createResponse = await fetch(`http://127.0.0.1:${appPort}/api/share-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: shareMapFixture }),
  });
  const createPayload = await getJson(createResponse);

  assert.equal(createResponse.status, 200);
  assert.equal(typeof createPayload.shareId, 'string');
  assert.ok(createPayload.shareId.length > 10);

  const getResponse = await fetch(`http://127.0.0.1:${appPort}/api/share-map/${createPayload.shareId}`);
  const getPayload = await getJson(getResponse);

  assert.equal(getResponse.status, 200);
  assert.equal(getPayload.map.title, shareMapFixture.title);
  assert.equal(getPayload.map.id, shareMapFixture.id);

  const missingResponse = await fetch(`http://127.0.0.1:${appPort}/api/share-map/not-a-real-share-id`);
  const missingPayload = await getJson(missingResponse);

  assert.equal(missingResponse.status, 404);
  assert.equal(typeof missingPayload.error, 'string');
  assert.equal('map' in missingPayload, false);
});
