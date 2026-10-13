import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateTestKeyPair } from './helpers/keys.js';
import { stdioExchange, session, sessionAt } from './helpers/stdio-client.js';
import { toolsetOf } from '../src/config/toolsets.js';

/**
 * The real server, over the real transport.
 *
 * Everything else in the suite imports tool modules directly. This file spawns `src/index.js` and
 * speaks JSON-RPC to it, so it is the only place that sees what a connected client sees: the
 * handshake, and `tools/list` exactly as it goes over the wire.
 */

const ROLES = ['merchant', 'isv', 'payment_institution'];

const sandbox = generateTestKeyPair();
const production = generateTestKeyPair();
let dir;
let env;

/** A line from the middle of a PEM body: unique to that key, and in no tool description. */
const fingerprint = pem => pem.split('\n')[5];

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'payware-mcp-stdio-'));
  const sandboxPath = join(dir, 'sandbox.pem');
  const productionPath = join(dir, 'production.pem');
  await writeFile(sandboxPath, sandbox.privateKey, 'utf8');
  await writeFile(productionPath, production.privateKey, 'utf8');
  env = {
    PAYWARE_PARTNER_ID: 'TESTPRTN',
    PAYWARE_SANDBOX_PRIVATE_KEY_PATH: sandboxPath,
    PAYWARE_PRODUCTION_PRIVATE_KEY_PATH: productionPath
  };
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function listTools(role) {
  const responses = await stdioExchange({
    cwd: dir,
    env: { ...env, PAYWARE_PARTNER_TYPE: role },
    messages: session({ jsonrpc: '2.0', id: 'list', method: 'tools/list' })
  });
  const list = responses.get('list');
  assert.ok(list.result, `tools/list failed for ${role}: ${JSON.stringify(list.error)}`);
  return list.result.tools;
}

describe('handshake', () => {
  test('agrees to a current protocol version', async () => {
    // SDK 0.5.0 knew only 2024-11-05 and answered any newer request with it, so a client asking for
    // 2025-06-18 was told this server predates tool annotations and structured output.
    const responses = await stdioExchange({
      cwd: dir,
      env: { ...env, PAYWARE_PARTNER_TYPE: 'merchant' },
      messages: sessionAt('2025-06-18')
    });
    const init = responses.get('init');
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.ok(init.result.capabilities.tools, 'the server must advertise tools');
  });
});

describe('tools/call', () => {
  test('returns a result a client accepts', async () => {
    // SDK 1.x validates every tools/call result against CallToolResultSchema before sending it, and
    // answers a malformed one with an error. A local tool keeps this off the network.
    const responses = await stdioExchange({
      cwd: dir,
      env: { ...env, PAYWARE_PARTNER_TYPE: 'merchant' },
      messages: session({
        jsonrpc: '2.0', id: 'call', method: 'tools/call',
        params: { name: 'payware_utils_format_json_deterministic', arguments: { payload: { b: 1, a: 2 } } }
      })
    });
    const call = responses.get('call');
    assert.equal(call.error, undefined, `tools/call failed: ${JSON.stringify(call.error)}`);
    assert.equal(call.result.content[0].type, 'text');
    assert.match(call.result.content[0].text, /\{"a":2,"b":1\}/, 'keys must come back sorted');
  });
});

describe('tools/list', () => {
  for (const role of ROLES) {
    test(`${role}: carries no private key material`, async () => {
      // 43 schemas had `default: getPrivateKeySafe()`, which reads the key FILE - so with a key
      // configured, tools/list sent the sandbox private key, in full, once per affected tool, to the
      // client and on into every model prompt that carried the tool definitions. The handlers already
      // fall back to the configured key; the schema never needed to say what it was.
      const wire = JSON.stringify(await listTools(role));
      assert.ok(!wire.includes(fingerprint(sandbox.privateKey)), `${role}: tools/list contains the sandbox private key`);
      assert.ok(!wire.includes(fingerprint(production.privateKey)), `${role}: tools/list contains the production private key`);
    });
  }
});

describe('tools/list annotations', () => {
  for (const role of ROLES) {
    test(`${role}: every tool is sent with its annotations`, async () => {
      // Declared on the tool is not the same as sent: tools/list builds each entry field by field,
      // and before SDK 1.x the protocol version this server spoke had no annotations at all.
      for (const tool of await listTools(role)) {
        assert.ok(tool.annotations, `${tool.name}: no annotations in tools/list`);
        assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', `${tool.name}: readOnlyHint missing`);
        assert.equal(typeof tool.annotations.destructiveHint, 'boolean', `${tool.name}: destructiveHint missing`);
        assert.equal(typeof tool.annotations.idempotentHint, 'boolean', `${tool.name}: idempotentHint missing`);
        assert.equal(typeof tool.annotations.openWorldHint, 'boolean', `${tool.name}: openWorldHint missing`);
      }
    });
  }
});

describe('PAYWARE_MCP_TOOLSETS', () => {
  test('lists only the chosen toolsets and refuses a call to any other tool', async () => {
    // Filtering the list alone would leave a hidden tool callable by name; the call must fail too.
    const responses = await stdioExchange({
      cwd: dir,
      env: { ...env, PAYWARE_PARTNER_TYPE: 'merchant', PAYWARE_MCP_TOOLSETS: 'placements' },
      messages: session(
        { jsonrpc: '2.0', id: 'list', method: 'tools/list' },
        {
          jsonrpc: '2.0', id: 'call', method: 'tools/call',
          params: { name: 'payware_utils_format_json_deterministic', arguments: { payload: { a: 1 } } }
        }
      )
    });

    const names = responses.get('list').result.tools.map(t => t.name);
    assert.ok(names.length > 0, 'the placements toolset must not come back empty');
    assert.deepEqual(names.filter(n => toolsetOf(n) !== 'placements'), [], 'only placements tools may be listed');

    const call = responses.get('call');
    assert.ok(call.error, 'a tool outside the chosen toolsets must not run');
    assert.match(call.error.message, /Unknown tool/);
  });
});
