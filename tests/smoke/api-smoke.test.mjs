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
  assert.ok(payload.results.every((item) => item.title === 'The Lever of Riches'));
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
  assert.equal(serverLogs.includes('复杂系统不是把元素堆起来'), false);
  assert.equal(serverLogs.includes('真正有效的阅读，不是尽快得到结论'), false);
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
