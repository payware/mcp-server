import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { FakePaywareServer, withEnv } from './helpers/fake-payware.js';
import { generateTestKeyPair } from './helpers/keys.js';
import { startPayware, IDS } from './helpers/payware-model.js';

/**
 * Every tool, in every role, against a model of payware (helpers/payware-model.js): the sandbox and
 * production API hosts and the two soundbite hosts, each environment with its own key, the server's
 * routes, authentication and validation, and DTO-shaped answers.
 *
 * request-contract.test.js goes deep on the tools that have broken before. This goes wide: each tool
 * is run once through its real handler, and the test asserts what reached the wire - the verb and
 * path, a signature that verifies, a content hash that matches the body - and that what came back is
 * a result a client will accept. A tool that calls a route the server does not have, or answers with
 * a shape the SDK refuses, fails here by name.
 *
 * ROUTES is the contract, and it was written from server/'s controllers (TransactionController,
 * TransactionHistoryController, ApiProductController, ScheduleController, AudioController,
 * CampaignController, PlacementController, AiringController, PlacementCalendarController,
 * ApiPOIController, ApiShopController, IsvInvitationController, ReferenceDataController,
 * LogAccessController, Oauth2Controller, ReportApiController), not from what the tools happened to
 * send. Every tool must have an entry, so a new tool cannot arrive without saying what it calls.
 *
 * Three passes: every tool as configured (sandbox unless a tool runs on production only), every tool
 * that takes useSandbox again with useSandbox false (production host, production key), and every tool
 * that calls payware against a payware 400, which must come back as isError.
 */

const { TX, PRODUCT, SCHEDULE, AUDIO, POI, REQUEST, EXPORT, INVITATION, OAUTH2_TOKEN, CAMPAIGN, PLACEMENT, RULE } = IDS;

/**
 * null: a local tool, which must send nothing at all. Several requests: an array, in order. Paths are
 * the server's, /api included; the OAuth2 endpoints sit at the host root.
 */
const ROUTES = {
  // Local: keys, tokens, code samples, formatting and callback simulation.
  payware_authentication_generate_rsa_keys: null,
  payware_authentication_create_jwt_token: null,
  payware_authentication_validate_jwt: null,
  payware_authentication_test_jwt: null,
  payware_authentication_setup_sandbox_auth: null,
  payware_generate_code_example: null,
  payware_generate_documentation: null,
  payware_utils_format_request: null,
  payware_utils_server_info: null,
  payware_utils_format_json_deterministic: null,
  payware_operations_simulate_callback: null,
  payware_logs_download_url: null,

  payware_authorization_oauth2_obtain_token: 'POST /oauth2/tokens',
  payware_authorization_oauth2_get_token_info: `GET /oauth2/tokens/${OAUTH2_TOKEN}`,
  payware_authorization_oauth2_list_tokens: 'GET /oauth2/tokens',
  payware_authorization_oauth2_rotate_token: `POST /oauth2/tokens/${OAUTH2_TOKEN}/rotate`,
  payware_authorization_oauth2_token_helper: 'POST /oauth2/tokens',

  payware_operations_create_transaction: 'POST /api/transactions',
  payware_operations_get_transaction_status: `GET /api/transactions/${TX}`,
  payware_operations_process_transaction: `POST /api/transactions/${TX}`,
  payware_operations_cancel_transaction: `PATCH /api/transactions/${TX}`,
  payware_operations_finalize_transaction: `PATCH /api/transactions/${TX}`,
  payware_operations_get_transaction_history: `GET /api/transactions-history/${TX}`,
  // On the soundbite host (SOUNDBITE_HOST below); the API hosts answer it 421.
  payware_operations_soundbite_transaction: 'POST /api/transactions',

  payware_products_list_products: 'GET /api/products',
  payware_products_create_product: 'POST /api/products',
  payware_products_get_product: `GET /api/products/${PRODUCT}`,
  // Only the PATCH: the server keeps every stored value the request leaves out (2026-11-11), so nothing is
  // read first. Until 2.2.0 the tool read the product and sent it whole.
  payware_products_update_product: `PATCH /api/products/${PRODUCT}`,
  payware_products_delete_product: `DELETE /api/products/${PRODUCT}`,
  payware_products_get_product_image: `POST /api/products/${PRODUCT}/image`,
  payware_products_get_schedules: `GET /api/products/${PRODUCT}/schedules`,
  payware_products_create_schedule: `POST /api/products/${PRODUCT}/schedules`,
  payware_products_get_schedule: `GET /api/products/${PRODUCT}/schedules/${SCHEDULE}`,
  // Only the PATCH, as update_product.
  payware_products_update_schedule: `PATCH /api/products/${PRODUCT}/schedules/${SCHEDULE}`,
  payware_products_delete_schedule: `DELETE /api/products/${PRODUCT}/schedules/${SCHEDULE}`,
  payware_products_get_audios: `GET /api/products/${PRODUCT}/audios`,
  payware_products_get_audio: `GET /api/products/${PRODUCT}/audios/${AUDIO}`,
  payware_products_register_audio: `POST /api/products/${PRODUCT}/audios/upload`,
  payware_products_update_audio: `PATCH /api/products/${PRODUCT}/audios/${AUDIO}`,
  payware_products_delete_audio: `DELETE /api/products/${PRODUCT}/audios/${AUDIO}`,

  payware_data_list_reports: 'GET /api/data-retrieval/reports',
  payware_data_generate_report: 'POST /api/data-retrieval',
  // The report's unit id is the last segment of its path (ReportDTO.path); the server takes
  // ^[A-Za-z0-9_-]{1,64}$ only, so the path itself was refused.
  payware_data_get_report_requests: 'GET /api/data-retrieval/processedTransactions',
  payware_data_get_report_status: `GET /api/data-retrieval/request/${REQUEST}/status`,
  payware_data_export_report: `POST /api/data-retrieval/request/${REQUEST}/export/pdf`,
  payware_data_get_export_list: `GET /api/data-retrieval/exports/${REQUEST}`,
  payware_data_get_export_status: `GET /api/data-retrieval/export/${EXPORT}/status`,
  payware_data_download_export: `GET /api/data-retrieval/export/${EXPORT}/download`,
  payware_data_cancel_report: `PUT /api/data-retrieval/${REQUEST}/cancel`,
  // The same route as cancel_report, given an export id. The server resolved it only as a report
  // request, so this 404'd until server 93167547 (feature/placements) taught it exports too.
  payware_data_cancel_export: `PUT /api/data-retrieval/${EXPORT}/cancel`,

  payware_logs_query: 'GET /api/logs',
  payware_logs_status: 'GET /api/logs/status',

  payware_shops_list: 'GET /api/shops',

  payware_poi_list: 'GET /api/poi',
  payware_poi_create: 'POST /api/poi',
  payware_poi_create_batch: 'POST /api/poi/batch',
  payware_poi_get: `GET /api/poi/${POI}`,
  payware_poi_get_status: `GET /api/poi/${POI}/status`,
  payware_poi_set_price: `PUT /api/poi/${POI}/price`,
  payware_poi_cancel_price: `DELETE /api/poi/${POI}/price`,
  payware_poi_get_qrcode: `GET /api/poi/${POI}/image`,

  payware_isv_create_invitation: 'POST /api/isv/invitations',
  payware_isv_list_invitations: 'GET /api/isv/invitations',
  payware_isv_get_invitation: `GET /api/isv/invitations/${INVITATION}`,
  payware_isv_cancel_invitation: `DELETE /api/isv/invitations/${INVITATION}`,

  payware_reference_lookup: 'GET /api/isv/reference/currencies',

  // Campaigns, placements and airings (server feature/placements).
  payware_campaigns_list_campaigns: 'GET /api/campaigns',
  payware_campaigns_create_campaign: 'POST /api/campaigns',
  payware_campaigns_get_campaign: `GET /api/campaigns/${CAMPAIGN}`,
  payware_campaigns_update_campaign: `PUT /api/campaigns/${CAMPAIGN}`,
  payware_campaigns_delete_campaign: `DELETE /api/campaigns/${CAMPAIGN}`,
  payware_campaigns_get_campaign_stats: `GET /api/campaigns/${CAMPAIGN}/stats`,
  payware_products_list_placements: `GET /api/products/${PRODUCT}/placements`,
  payware_products_create_placement: `POST /api/products/${PRODUCT}/placements`,
  payware_products_get_placement: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_update_placement: `PUT /api/products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_delete_placement: `DELETE /api/products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_get_placement_image: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}/image`,
  payware_products_get_placement_stats: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}/stats`,
  payware_products_list_airings: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_create_airing: `POST /api/products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_replace_airings: `PUT /api/products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_get_next_airings: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}/airings/next`,
  payware_products_get_airing: `GET /api/products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_update_airing: `PUT /api/products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_delete_airing: `DELETE /api/products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_get_airing_calendar: 'GET /api/placements/calendar'
};

/** POSTs that only render or look something up and store nothing, so read-only despite the verb. */
const READ_ONLY_POSTS = new Set(['payware_products_get_product_image', 'payware_operations_soundbite_transaction']);

/** Tools answered on the soundbite host rather than the API host. */
const SOUNDBITE_HOST = new Set(['payware_operations_soundbite_transaction']);

/** Reports run on production only (the data server serves production data), whatever the environment. */
const PRODUCTION_ONLY = name => name.startsWith('payware_data_');

/**
 * What payware refuses although the tool calls it correctly: server defects the tool text names, so
 * the refusal is the right answer for now. role/tool -> errorCode.
 */
const SERVER_REFUSALS = {};

/** A value for each required parameter, by name. A required parameter missing here fails loudly. */
const SAMPLE = {
  transactionId: TX, productId: PRODUCT, scheduleId: SCHEDULE, audioId: AUDIO, poiId: POI,
  requestId: REQUEST, exportId: EXPORT, invitationId: INVITATION, token: OAUTH2_TOKEN,
  merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN,
  // A report path as list_reports shows it (ReportDTO.path); the tools send its last segment.
  reportId: '/reports/payware/processedTransactions', reportUnitId: '/reports/payware/processedTransactions', outputFormat: 'pdf',
  amount: '10.00', currency: 'EUR', reasonL1: 'Test', name: 'Till 1', shopCode: 'SHOP01',
  // SRC: the payer creating, who sends no account. DST, which needs one, is in request-contract.test.js.
  account: 'BG80BNBG96611020345678', friendlyName: 'Test Account', role: 'SRC',
  email: 'merchant@example.com', status: 'CONFIRMED', statusMessage: 'Test',
  pois: [{ name: 'Till 1' }], payload: { b: 1, a: 2 }, type: 'headers', operation: 'authentication',
  dataset: 'currencies',
  campaignId: CAMPAIGN, placementId: PLACEMENT, ruleId: RULE,
  medium: 'OUTDOOR', carriers: ['QR', 'NFC'], frequency: 'DAILY', startDate: '2026-10-15',
  windows: [{ start: '08:00', end: '08:30' }],
  rules: [{ frequency: 'DAILY', startDate: '2026-10-15', windows: [{ start: '08:00', end: '08:30' }] }],
  from: '2026-10-19', to: '2026-10-26'
};

/** Optional arguments a tool needs to take the path under test. */
const EXTRA_ARGS = {
  // The client id and secret are optional parameters that fall back to PAYWARE_OAUTH_CLIENT_*; passed
  // here because the environment below clears those (a developer's .env would otherwise supply them).
  payware_authorization_oauth2_obtain_token: { clientId: 'TESTMRCH', clientSecret: 'dGVzdC1zZWNyZXQ=' },
  payware_authorization_oauth2_token_helper: { clientId: 'TESTMRCH', clientSecret: 'dGVzdC1zZWNyZXQ=' },
  // EXECUTING is the call that carries the money fields (server docs/execution-lock.md); the
  // CONFIRMED that follows it is covered below.
  payware_operations_finalize_transaction: { status: 'EXECUTING', amount: '10.00', fee: '0.10', currency: 'EUR', transferType: 'INSTANT' },
  payware_products_update_audio: { title: 'Jingle' },
  // reasonL1 is optional in the institution's schema (a product brings its own) but a pw id needs it.
  payware_operations_process_transaction: { reasonL1: 'Test' },
  payware_utils_format_request: { jwtToken: 'x.y.z' }
};

// The generated-program test below runs programs against a plain recording server with its own key.
const { publicKey, privateKey } = generateTestKeyPair();
let payware;
let server;
let dir;

before(async () => {
  payware = await startPayware();
  server = payware.sandbox;
  // validate_jwt checks a real token: one made as the tools make them, with the sandbox key.
  const { createJWTToken } = await import('../src/core/auth/jwt-token.js');
  SAMPLE.jwtToken = createJWTToken('TESTMRCH', payware.privateKeys.sandbox, null).token;
  dir = await mkdtemp(join(tmpdir(), 'payware-mcp-routes-'));
  await writeFile(join(dir, 'test-private-key.pem'), privateKey, 'utf8');
  // Two tools upload a local file. The bytes only have to exist; the fake server does not decode them.
  SAMPLE.audioPath = join(dir, 'jingle.mp3');
  SAMPLE.filePath = join(dir, 'soundbite.wav');
  await writeFile(SAMPLE.audioPath, Buffer.from('ID3 test audio'));
  await writeFile(SAMPLE.filePath, Buffer.from('RIFF test audio'));
});

after(async () => {
  await payware.stop();
  await rm(dir, { recursive: true, force: true });
});

const as = (role, fn) => withEnv(payware.env(role), fn);

const { getMerchantTools } = await import('../src/merchant/index.js');
const { getISVTools } = await import('../src/isv/index.js');
const { getPaymentInstitutionTools } = await import('../src/payment-institution/index.js');

const ROLES = [
  { name: 'merchant', tools: getMerchantTools() },
  { name: 'isv', tools: getISVTools() },
  { name: 'payment_institution', tools: getPaymentInstitutionTools() }
];

function argsFor(tool) {
  const args = {};
  for (const key of tool.inputSchema.required ?? []) {
    assert.ok(key in SAMPLE, `${tool.name}: no sample value for required parameter "${key}" - add one to SAMPLE`);
    args[key] = SAMPLE[key];
  }
  return { ...args, ...EXTRA_ARGS[tool.name] };
}

const routesOf = name => (ROUTES[name] === null ? [] : [ROUTES[name]].flat());

/** The host a tool's requests go to: soundbite or API, sandbox or production. */
function hostFor(name, useSandbox) {
  const environment = PRODUCTION_ONLY(name) || useSandbox === false ? 'production' : 'sandbox';
  return SOUNDBITE_HOST.has(name) ? `soundbite-${environment}` : environment;
}

/** What every request a tool sent must satisfy, whatever the pass. */
function assertWire(tool, args) {
  for (const req of payware.requests()) {
    assert.equal(req.jwt.signatureValid, true, `${req.method} ${req.path}: JWT does not verify with the ${req.host} key`);
    // The server's rule: an OAuth2 request is addressed to payware; any other request that
    // carries a merchant's OAuth2 token is on behalf of that merchant, which the JWT says
    // with aud = the merchant and sub = the token.
    const onBehalf = 'oauth2Token' in args && !req.path.startsWith('/oauth2/');
    assert.deepEqual(
      { aud: req.jwt.payload.aud, sub: req.jwt.payload.sub },
      onBehalf ? { aud: args.merchantPartnerId, sub: args.oauth2Token } : { aud: 'https://payware.eu', sub: undefined },
      `${req.method} ${req.path}: wrong audience for ${onBehalf ? 'an on-behalf' : 'a direct'} call`);
    if (req.json !== null) {
      assert.equal(req.contentHashMatches, true, `${req.method} ${req.path}: contentSha256 does not match the body`);
    }
  }
}

function assertResult(result) {
  const parsed = CallToolResultSchema.safeParse(result);
  assert.ok(parsed.success, `not a valid tools/call result: ${parsed.error?.message}`);
  assert.ok(result.content.length > 0 && result.content.every(c => c.type !== 'text' || c.text.length > 0),
    'a result must say something');
}

const refusedBy = req => (req.response.status >= 400 ? `${req.response.status} ${req.response.body?.errorCode}` : null);

describe('every tool reaches the route the server has', () => {
  test('every tool declares its route', () => {
    const missing = ROLES.flatMap(r => r.tools.map(t => t.name)).filter(n => !(n in ROUTES));
    assert.deepEqual([...new Set(missing)], [], 'add these to ROUTES, with the route from the server controller');
  });

  test('every tool that calls payware lets the caller choose the environment, except the production-only reports', () => {
    const without = ROLES.flatMap(r => r.tools)
      .filter(t => ROUTES[t.name] !== null && !PRODUCTION_ONLY(t.name) && !('useSandbox' in t.inputSchema.properties))
      .map(t => t.name);
    assert.deepEqual([...new Set(without)], []);
  });

  for (const useSandbox of [undefined, false]) {
    describe(useSandbox === false ? 'with useSandbox false' : 'as configured', () => {
      for (const role of ROLES) {
        describe(role.name, () => {
          for (const tool of role.tools) {
            if (useSandbox === false && !('useSandbox' in tool.inputSchema.properties)) continue;
            test(tool.name, async () => {
              const args = { ...argsFor(tool), ...(useSandbox === false && { useSandbox: false }) };
              payware.reset();

              const result = await as(role.name, () => tool.handler(args));

              const host = hostFor(tool.name, useSandbox);
              assert.deepEqual(payware.requests().map(r => `${r.host} ${r.method} ${r.path}`),
                routesOf(tool.name).map(route => `${host} ${route}`));
              assertWire(tool, args);

              // The annotations must agree with the route. A route-less tool is local; a read-only one
              // may only GET (the POSTs in READ_ONLY_POSTS render or look up and store nothing);
              // anything that PATCHes, PUTs or DELETEs overwrites or removes, which is what
              // destructiveHint is for.
              const hints = tool.annotations;
              const routes = routesOf(tool.name);
              if (routes.length === 0) {
                assert.deepEqual([hints.readOnlyHint, hints.openWorldHint], [true, false], 'a local tool is read-only and closed-world');
              } else {
                const method = routes[routes.length - 1].split(' ')[0];
                assert.equal(hints.openWorldHint, true, 'a tool that calls payware is open-world');
                if (hints.readOnlyHint) {
                  assert.ok(method === 'GET' || READ_ONLY_POSTS.has(tool.name), `declared read-only, but sends ${method}`);
                }
                if (['PATCH', 'PUT', 'DELETE'].includes(method)) {
                  assert.equal(hints.destructiveHint, true, `sends ${method}, so it is destructive`);
                }
              }

              assertResult(result);
              const expectedRefusal = SERVER_REFUSALS[`${role.name}/${tool.name}`];
              if (expectedRefusal) {
                assert.equal(result.isError, true, `payware answers ${expectedRefusal}, which must read as an error`);
                assert.match(result.content.map(c => c.text ?? '').join('\n'), new RegExp(expectedRefusal));
              } else {
                const refused = payware.requests().map(refusedBy).filter(Boolean);
                assert.deepEqual(refused, [], 'payware refused the request: the tool sends what the server does not accept');
                assert.notEqual(result.isError, true, `answered as an error: ${result.content[0]?.text?.slice(0, 200)}`);
              }
            });
          }
        });
      }
    });
  }

  describe('against a payware refusal', () => {
    for (const role of ROLES) {
      describe(role.name, () => {
        for (const tool of role.tools) {
          if (ROUTES[tool.name] === null) continue;
          test(tool.name, async () => {
            payware.reset();
            // The first request on any host is refused, as payware refuses a field it does not accept.
            for (const host of payware.all()) {
              host.respondWith(400, { errorCode: 'ERR_TEST_REFUSAL', message: 'Refused by the test.', correlationId: 'test-correlation-id' });
            }
            const result = await as(role.name, () => tool.handler(argsFor(tool)));
            assertResult(result);
            assert.equal(result.isError, true, `a payware 400 read as a success: ${result.content[0]?.text?.slice(0, 200)}`);
            const text = result.content.map(c => c.text ?? '').join('\n');
            // A known server refusal comes first: the model refuses before the queued answer.
            const expected = SERVER_REFUSALS[`${role.name}/${tool.name}`] ?? 'ERR_TEST_REFUSAL|Refused by the test';
            assert.ok(new RegExp(expected).test(text), `the refusal is not reported: ${text.slice(0, 300)}`);
          });
        }
      });
    }
  });
});

describe('routes that depend on the arguments', () => {
  test('moving an audio to another product is a transfer, not an update', async () => {
    const tool = getMerchantTools().find(t => t.name === 'payware_products_update_audio');
    payware.reset();
    await as('merchant', () => tool.handler({ productId: PRODUCT, audioId: AUDIO, newProductId: 'pr87654321' }));
    assert.deepEqual(server.requests.map(r => `${r.method} ${r.path}`),
      [`POST /api/products/${PRODUCT}/audios/${AUDIO}/transfer`]);
    assert.equal(server.lastRequest.contentHashMatches, true);
  });
});

describe('finalize: the execution lock', () => {
  // The model holds the lock (server docs/execution-lock.md): IDS.TX starts processed and ACTIVE.
  const finalize = () => getPaymentInstitutionTools().find(t => t.name === 'payware_operations_finalize_transaction');
  const EXECUTING = { transactionId: TX, status: 'EXECUTING', amount: '10.00', fee: '0.10', currency: 'EUR', transferType: 'INSTANT' };

  test('EXECUTING then CONFIRMED with just the status, both on the same PATCH route', async () => {
    // The handler used to demand amount, fee and currency for CONFIRMED. After the lock the server
    // takes the status alone, so the handler must not refuse it.
    payware.reset();
    const locked = await as('payment_institution', () => finalize().handler(EXECUTING));
    const confirmed = await as('payment_institution', () => finalize().handler({ transactionId: TX, status: 'CONFIRMED' }));

    assert.deepEqual(server.requests.map(r => `${r.method} ${r.path} ${r.response.status}`),
      [`PATCH /api/transactions/${TX} 200`, `PATCH /api/transactions/${TX} 200`]);
    assert.deepEqual(server.requests[1].json, { status: 'CONFIRMED' });
    for (const req of server.requests) assert.equal(req.contentHashMatches, true);
    assert.match(locked.content[0].text, /EXECUTING sends no callback/);
    // The EXECUTING answer's amount is already net of the fee: the Merchant Leg is that amount.
    assert.equal(server.requests[0].response.body.amount, '9.90');
    assert.match(locked.content[0].text, /already net of the fee/);
    assert.match(confirmed.content[0].text, /TRANSACTION_FINALIZED/);
    for (const result of [locked, confirmed]) {
      assert.ok(CallToolResultSchema.safeParse(result).success);
      assert.notEqual(result.isError, true);
    }
  });

  test('CONFIRMED without the lock is refused, and reads as an error', async () => {
    payware.reset();
    const result = await as('payment_institution', () => finalize().handler({ transactionId: TX, status: 'CONFIRMED' }));
    assert.equal(server.lastRequest.response.body.errorCode, 'ERR_NOT_EXECUTING');
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /ERR_NOT_EXECUTING/);
  });

  test('an identical EXECUTING repeat is answered; a different one is a 409', async () => {
    payware.reset();
    await as('payment_institution', () => finalize().handler(EXECUTING));
    const repeat = await as('payment_institution', () => finalize().handler(EXECUTING));
    const different = await as('payment_institution', () => finalize().handler({ ...EXECUTING, fee: '0.20' }));
    assert.deepEqual(server.requests.map(r => r.response.status), [200, 200, 409]);
    assert.notEqual(repeat.isError, true);
    assert.equal(different.isError, true);
    assert.match(different.content[0].text, /ERR_EXECUTION_MISMATCH/);
    // A 409 is payware's own answer: the lock is held with another body, so check before moving money.
    assert.match(different.content[0].text, /already locked with a different body/);
  });

  test('a gateway error without an errorCode is not a refusal: repeat the identical EXECUTING', async () => {
    // A 502 from a proxy says nothing about the lock, which may have been committed behind it.
    payware.reset();
    server.respondWith(502, '<html>Bad Gateway</html>', { 'Content-Type': 'text/html' });
    const result = await as('payment_institution', () => finalize().handler(EXECUTING));
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /repeat the identical EXECUTING/);
    assert.doesNotMatch(result.content[0].text, /release the reservation/);
  });

  test('a payware 400 on EXECUTING is a refusal: release the reservation', async () => {
    payware.reset();
    const result = await as('payment_institution', () => finalize().handler({ ...EXECUTING, currency: 'XXX' }));
    assert.equal(server.lastRequest.response.status, 400);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /release the reservation/);
  });

  test('an id the server looks up literally: only pw is offered', () => {
    const pattern = new RegExp(finalize().inputSchema.properties.transactionId.pattern);
    assert.ok(pattern.test(TX));
    for (const id of ['pr12345678', 'ps12345678', 'pl12345678', 'pi12345678']) assert.ok(!pattern.test(id), id);
    assert.ok(pattern.test('pw' + 'A'.repeat(30)), 'ids may grow to 32 characters');
  });
});

describe('placement tools', () => {
  test('a placement image asks for its type and format, and a PNG comes back as an image', async () => {
    const tool = getISVTools().find(t => t.name === 'payware_products_get_placement_image');
    payware.reset();
    server.respondWith(200, 'PNG-BYTES', { 'Content-Type': 'image/png' });

    const result = await as('isv', () => tool.handler({
      merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN, productId: PRODUCT, placementId: PLACEMENT,
      type: 'BARCODE', format: 'PNG'
    }));

    assert.deepEqual(server.lastRequest.query, { type: 'BARCODE', format: 'PNG' });
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.content[0].mimeType, 'image/png');
    assert.equal(Buffer.from(result.content[0].data, 'base64').toString(), 'PNG-BYTES');
  });

  test('a refused replace-all says nothing was saved and names each refused rule', async () => {
    // The server's AiringBatchErrorDTO: errorCode, message and rows, each with its index.
    const tool = getMerchantTools().find(t => t.name === 'payware_products_replace_airings');
    payware.reset();
    server.respondWith(400, {
      errorCode: 'ERR_INVALID_AIRING_RULE', message: 'Invalid airing rule.',
      rows: [{ index: 1, errorCode: 'ERR_INVALID_AIRING_WINDOW', message: 'Invalid airing window.' }]
    });

    const result = await as('merchant', () => tool.handler({
      productId: PRODUCT, placementId: PLACEMENT, rules: SAMPLE.rules
    }));

    assert.equal(result.isError, true, 'a refusal must be marked as an error for the client');
    assert.match(result.content[0].text, /nothing was saved/);
    assert.match(result.content[0].text, /#1: ERR_INVALID_AIRING_WINDOW/);
  });

  test('a merchant tool takes no key or partner id as an argument', () => {
    // Older tools accept privateKey as a parameter, which puts the key in the model's context.
    for (const tool of getMerchantTools().filter(t => t.name.includes('campaign') || t.name.includes('placement') || t.name.includes('airing'))) {
      const params = Object.keys(tool.inputSchema.properties);
      assert.ok(!params.includes('privateKey') && !params.includes('partnerId'), `${tool.name} takes credentials as arguments`);
    }
  });
});

describe('generated Node.js programs', () => {
  // payware_generate_code_example writes complete programs. These run every Node.js one for real against
  // fake servers, which verify the JWT and the content hash as payware does: the route, typ and alg, the
  // signature, contentSha256 over the exact bytes sent, aud and sub (on behalf of a merchant for an ISV,
  // except at /oauth2), Api-Version, and the upload. Node only, so the suite needs nothing else installed.
  test('reach a route the server has, signed as the server expects', { timeout: 180000 }, async () => {
    const { advancedCodeGenerator: g } = await import('../src/tools/advanced-code-generator.js');
    const { renderRequest } = await import('../src/tools/code-example-languages.js');
    const run = promisify(execFile);
    const nodePath = fileURLToPath(new URL('../node_modules', import.meta.url));

    const jobs = [];
    for (const partnerType of g.partnerTypes) {
      for (const operation of Object.keys(g.operationDefinitions)) {
        if (operation === 'authentication' || !g.operationDefinitions[operation].partnerTypes.includes(partnerType)) continue;
        const def = g.definitionFor(operation, partnerType);
        for (const request of def.steps ?? [def]) {
          jobs.push({ partnerType, spec: { base: 'api', params: {}, body: null, ...request, onBehalf: partnerType === 'isv' && request.base !== 'host' } });
        }
      }
    }

    const servers = await Promise.all(Array.from({ length: 6 }, async () => {
      const fake = new FakePaywareServer({ publicKey });
      await fake.start();
      return fake;
    }));
    const failures = [];
    try {
      let next = 0;
      await Promise.all(servers.map(async fake => {
        while (next < jobs.length) {
          const { partnerType, spec } = jobs[next];
          const where = `${spec.name} (${partnerType})`;
          const jobDir = join(dir, `node-${next++}`);
          await mkdir(jobDir);
          await writeFile(join(jobDir, 'jingle.mp3'), Buffer.from('ID3 test audio'));
          await writeFile(join(jobDir, 'program.js'), renderRequest('nodejs', spec, partnerType));
          fake.requests.length = 0;
          try {
            await run(process.execPath, [join(jobDir, 'program.js')], {
              cwd: jobDir,
              timeout: 30000,
              env: {
                PAYWARE_PARTNER_ID: 'TESTPRTN',
                PAYWARE_PRIVATE_KEY_PATH: join(dir, 'test-private-key.pem'),
                PAYWARE_BASE_URL: `${fake.url}/api`,
                PAYWARE_MERCHANT_PARTNER_ID: 'PZAYNMVE',
                PAYWARE_OAUTH2_TOKEN: OAUTH2_TOKEN,
                NODE_PATH: nodePath,
                ...(process.env.SystemRoot && { SystemRoot: process.env.SystemRoot })
              }
            });
          } catch (error) {
            failures.push(`${where}: did not run: ${String(error.stderr || error.message).split('\n')[0]}`);
            continue;
          }
          const req = fake.requests[0];
          const path = `${spec.base === 'host' ? '' : '/api'}${spec.path.replace(/\{(\w+)\}/g, (_, p) => spec.params[p])}`;
          const claims = spec.onBehalf ? { aud: 'PZAYNMVE', sub: OAUTH2_TOKEN } : { aud: 'https://payware.eu', sub: undefined };
          const checks = [
            [fake.requests.length === 1, `${fake.requests.length} requests`],
            [req && `${req.method} ${req.path}` === `${spec.method} ${path}`, `sent ${req?.method} ${req?.path}`],
            [req?.jwt.signatureValid === true, 'signature does not verify'],
            [req?.jwt.header?.alg === 'RS256' && req?.jwt.header?.typ === 'JWT', 'header is not RS256 JWT'],
            [req?.jwt.payload?.aud === claims.aud && req?.jwt.payload?.sub === claims.sub, `claims ${JSON.stringify(req?.jwt.payload)}`],
            [req?.headers['api-version'] === '1', 'no Api-Version: 1'],
            [spec.body ? req?.contentHashMatches === true && JSON.stringify(req?.json) === JSON.stringify(spec.body) : !req?.jwt.header?.contentSha256,
              spec.body ? 'body or content hash wrong' : 'a content hash without a JSON body'],
            [!spec.multipart || (String(req?.headers['content-type']).startsWith('multipart/form-data') && req?.rawBody.includes('ID3 test audio')),
              'upload missing']
          ];
          for (const [ok, message] of checks) if (!ok) failures.push(`${where}: ${message}`);
        }
      }));
    } finally {
      await Promise.all(servers.map(fake => fake.stop()));
    }
    assert.deepEqual(failures, []);
  });
});

describe('local side effects', () => {
  test('a saved export goes to the temp directory and the result says where', async () => {
    // It was written to a fixed path on one developer's machine, which no other machine has.
    const { tmpdir: systemTmp } = await import('node:os');
    const { existsSync } = await import('node:fs');
    const tool = getMerchantTools().find(t => t.name === 'payware_data_download_export');
    payware.reset();

    // Reports run on production; the model answers a CSV with its file name in Content-Disposition.
    const result = await as('merchant', () => tool.handler({ exportId: EXPORT, saveToFile: true }));

    const saved = join(systemTmp(), 'payware-mcp-downloads', `report_${EXPORT.substring(0, 8)}.csv`);
    try {
      assert.ok(existsSync(saved), `expected the export at ${saved}`);
      assert.ok(result.content[0].text.includes(saved), 'the result must name the file it wrote');
    } finally {
      await rm(saved, { force: true });
    }
  });
});
