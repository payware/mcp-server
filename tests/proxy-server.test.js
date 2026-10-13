import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The HTTP proxy (`npm run proxy`) refuses requests a browser can be tricked into sending.
 *
 * Its routes sign as the configured partner, and it listens on loopback, which is exactly what a DNS
 * rebinding page targets: the attacker's hostname is re-pointed at 127.0.0.1, the page is then
 * same-origin with the proxy, and CORS - which only governs reading responses - never applies. Only
 * a check on Host stops that, and only a check on Origin stops a plain cross-site POST.
 *
 * Every request here goes to /health or is refused before routing, so no MCP process is spawned and
 * no credentials are involved.
 */

const PROXY_PATH = fileURLToPath(new URL('../src/proxy-server.js', import.meta.url));
let proxy;
let port;
let dir;

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port: p } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return p;
}

/** A request with exactly these headers. fetch() will not let a caller set Host; http.request will. */
function send({ method = 'GET', path = '/health', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  port = await freePort();
  dir = await mkdtemp(join(tmpdir(), 'payware-mcp-proxy-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PAYWARE_')));
  proxy = spawn(process.execPath, [PROXY_PATH], { cwd: dir, env: { ...env, PROXY_PORT: String(port) } });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('proxy did not start')), 60000);
    proxy.stdout.on('data', chunk => {
      if (String(chunk).includes('running on')) { clearTimeout(timer); resolve(); }
    });
    proxy.on('exit', code => { clearTimeout(timer); reject(new Error(`proxy exited with ${code}`)); });
  });
});

after(async () => {
  proxy?.kill();
  await rm(dir, { recursive: true, force: true });
});

describe('proxy request checks', () => {
  test('answers on its own loopback names', async () => {
    assert.equal((await send({ headers: { host: `127.0.0.1:${port}` } })).status, 200);
    assert.equal((await send({ headers: { host: `localhost:${port}` } })).status, 200);
  });

  test('refuses a rebound hostname', async () => {
    // What a DNS rebinding page sends: its own name, now resolving to 127.0.0.1.
    const res = await send({ path: '/tools', headers: { host: `attacker.example:${port}` } });
    assert.equal(res.status, 403);
    assert.match(res.body, /Host attacker\.example/);
  });

  test('refuses a cross-site origin even without a preflight', async () => {
    // A form POST or a text/plain fetch reaches the route without preflight; CORS would only have
    // hidden the response from the page, after the partner's key had signed the call.
    const res = await send({
      method: 'POST', path: '/tools/payware_operations_create_transaction',
      headers: { host: `127.0.0.1:${port}`, origin: 'https://attacker.example', 'content-type': 'text/plain' }
    });
    assert.equal(res.status, 403);
    assert.match(res.body, /Origin https:\/\/attacker\.example/);
  });

  test('accepts its own origin', async () => {
    const res = await send({ headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` } });
    assert.equal(res.status, 200);
  });
});
