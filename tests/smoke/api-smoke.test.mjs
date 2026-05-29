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

let appPort = 0;
let stubPort = 0;
let serverProcess;
let stubServer;
let serverLogs = '';

function getJson(response) {
  return response.json();
}

function appendLog(chunk) {
  serverLogs += chunk.toString();
}

async function waitForLogsToFlush() {
  await new Promise((resolve) => setTimeout(resolve, 60));
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
  await waitForLogsToFlush();
  assert.equal(serverLogs.includes('generate_map_summary'), true);
  assert.equal(serverLogs.includes('复杂系统不是把元素堆起来'), false);
  assert.equal(serverLogs.includes('真正有效的阅读，不是尽快得到结论'), false);
  assert.equal(serverLogs.includes('Output valid JSON only.'), false);
  assert.equal(serverLogs.includes('YOUR_SILICONFLOW_API_KEY'), false);
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
    assert.ok(payload.map.parts.length >= 2);
    assert.ok(payload.map.methods.items.length >= 2);

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
    assert.ok(payload.map.overview.cards.some((card) => /两套思维系统|偏误|慢思考/.test(card.title)));
    assert.ok(payload.map.quotes.every((item) => item.quote.startsWith('关键判断：')));
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
