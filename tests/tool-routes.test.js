import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { FakePaywareServer, withEnv } from './helpers/fake-payware.js';
import { generateTestKeyPair } from './helpers/keys.js';

/**
 * Every tool, in every role, against the fake server.
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
 */

const TX = 'pw12345678';
const PRODUCT = 'pr12345678';
const SCHEDULE = 11;
const AUDIO = 7;
const POI = 'piABC12345';
const REQUEST = '1a81220c-2e38-4759-b067-c81abf176295';
const EXPORT = '2a81220c-2e38-4759-b067-c81abf176296';
const INVITATION = 42;
const OAUTH2_TOKEN = 'test-oauth2-token';
const CAMPAIGN = 'cp12345678';
const PLACEMENT = 'pl12345678';
const RULE = 17;

/** null: a local tool, which must send nothing at all. */
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
  payware_authorization_oauth2_token_helper: 'POST /oauth2/tokens',

  payware_operations_create_transaction: 'POST /transactions',
  payware_operations_get_transaction_status: `GET /transactions/${TX}`,
  payware_operations_process_transaction: `POST /transactions/${TX}`,
  payware_operations_cancel_transaction: `PATCH /transactions/${TX}`,
  payware_operations_finalize_transaction: `PATCH /transactions/${TX}`,
  payware_operations_get_transaction_history: `GET /transactions-history/${TX}`,
  payware_operations_soundbite_transaction: 'POST /transactions',

  payware_deep_links_get_transaction_link: `GET /transactions/${TX}/link`,
  payware_deep_links_delete_transaction_link: `DELETE /transactions/${TX}/link`,
  payware_deep_links_get_product_link: `GET /products/${PRODUCT}/link`,
  payware_deep_links_delete_product_link: `DELETE /products/${PRODUCT}/link`,

  payware_products_list_products: 'GET /products',
  payware_products_create_product: 'POST /products',
  payware_products_get_product: `GET /products/${PRODUCT}`,
  payware_products_update_product: `PATCH /products/${PRODUCT}`,
  payware_products_delete_product: `DELETE /products/${PRODUCT}`,
  payware_products_get_product_image: `POST /products/${PRODUCT}/image`,
  payware_products_get_schedules: `GET /products/${PRODUCT}/schedules`,
  payware_products_create_schedule: `POST /products/${PRODUCT}/schedules`,
  payware_products_get_schedule: `GET /products/${PRODUCT}/schedules/${SCHEDULE}`,
  payware_products_update_schedule: `PATCH /products/${PRODUCT}/schedules/${SCHEDULE}`,
  payware_products_delete_schedule: `DELETE /products/${PRODUCT}/schedules/${SCHEDULE}`,
  payware_products_get_audios: `GET /products/${PRODUCT}/audios`,
  payware_products_get_audio: `GET /products/${PRODUCT}/audios/${AUDIO}`,
  payware_products_register_audio: `POST /products/${PRODUCT}/audios/upload`,
  payware_products_update_audio: `PATCH /products/${PRODUCT}/audios/${AUDIO}`,
  payware_products_delete_audio: `DELETE /products/${PRODUCT}/audios/${AUDIO}`,

  payware_data_list_reports: 'GET /data-retrieval/reports',
  payware_data_generate_report: 'POST /data-retrieval',
  // reportId is a report path - '/processedTransactionsMTD' - so it supplies its own slash.
  payware_data_get_report_requests: 'GET /data-retrieval/processedTransactionsMTD',
  payware_data_get_report_status: `GET /data-retrieval/request/${REQUEST}/status`,
  payware_data_export_report: `POST /data-retrieval/request/${REQUEST}/export/pdf`,
  payware_data_get_export_list: `GET /data-retrieval/exports/${REQUEST}`,
  payware_data_get_export_status: `GET /data-retrieval/export/${EXPORT}/status`,
  payware_data_download_export: `GET /data-retrieval/export/${EXPORT}/download`,
  payware_data_cancel_report: `PUT /data-retrieval/${REQUEST}/cancel`,
  // The same route as cancel_report, given an export id. The server resolved it only as a report
  // request, so this 404'd until server 93167547 (feature/placements) taught it exports too.
  payware_data_cancel_export: `PUT /data-retrieval/${EXPORT}/cancel`,

  payware_logs_query: 'GET /logs',
  payware_logs_status: 'GET /logs/status',

  payware_shops_list: 'GET /shops',

  payware_poi_list: 'GET /poi',
  payware_poi_create: 'POST /poi',
  payware_poi_create_batch: 'POST /poi/batch',
  payware_poi_get: `GET /poi/${POI}`,
  payware_poi_get_status: `GET /poi/${POI}/status`,
  payware_poi_set_price: `PUT /poi/${POI}/price`,
  payware_poi_cancel_price: `DELETE /poi/${POI}/price`,
  payware_poi_get_qrcode: `GET /poi/${POI}/image`,

  payware_isv_create_invitation: 'POST /isv/invitations',
  payware_isv_list_invitations: 'GET /isv/invitations',
  payware_isv_get_invitation: `GET /isv/invitations/${INVITATION}`,
  payware_isv_cancel_invitation: `DELETE /isv/invitations/${INVITATION}`,

  payware_reference_lookup: 'GET /isv/reference/currencies',

  // Campaigns, placements and airings (server feature/placements).
  payware_campaigns_list_campaigns: 'GET /campaigns',
  payware_campaigns_create_campaign: 'POST /campaigns',
  payware_campaigns_get_campaign: `GET /campaigns/${CAMPAIGN}`,
  payware_campaigns_update_campaign: `PUT /campaigns/${CAMPAIGN}`,
  payware_campaigns_delete_campaign: `DELETE /campaigns/${CAMPAIGN}`,
  payware_campaigns_get_campaign_stats: `GET /campaigns/${CAMPAIGN}/stats`,
  payware_products_list_placements: `GET /products/${PRODUCT}/placements`,
  payware_products_create_placement: `POST /products/${PRODUCT}/placements`,
  payware_products_get_placement: `GET /products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_update_placement: `PUT /products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_delete_placement: `DELETE /products/${PRODUCT}/placements/${PLACEMENT}`,
  payware_products_get_placement_image: `GET /products/${PRODUCT}/placements/${PLACEMENT}/image`,
  // A GET that mints the short link on first request, hence ADDS rather than READS.
  payware_products_get_placement_link: `GET /products/${PRODUCT}/placements/${PLACEMENT}/link`,
  payware_products_get_placement_stats: `GET /products/${PRODUCT}/placements/${PLACEMENT}/stats`,
  payware_products_list_airings: `GET /products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_create_airing: `POST /products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_replace_airings: `PUT /products/${PRODUCT}/placements/${PLACEMENT}/airings`,
  payware_products_get_next_airings: `GET /products/${PRODUCT}/placements/${PLACEMENT}/airings/next`,
  payware_products_get_airing: `GET /products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_update_airing: `PUT /products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_delete_airing: `DELETE /products/${PRODUCT}/placements/${PLACEMENT}/airings/${RULE}`,
  payware_products_get_airing_calendar: 'GET /placements/calendar'
};

/** POSTs that only render something and store nothing, so read-only despite the verb. */
const READ_ONLY_POSTS = new Set(['payware_products_get_product_image']);

/** A value for each required parameter, by name. A required parameter missing here fails loudly. */
const SAMPLE = {
  transactionId: TX, productId: PRODUCT, scheduleId: SCHEDULE, audioId: AUDIO, poiId: POI,
  requestId: REQUEST, exportId: EXPORT, invitationId: INVITATION, token: OAUTH2_TOKEN,
  merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN,
  reportId: '/processedTransactionsMTD', reportUnitId: '/processedTransactionsMTD', outputFormat: 'pdf',
  amount: '10.00', currency: 'EUR', reasonL1: 'Test', name: 'Till 1', shopCode: 'SHOP01',
  account: 'BG80BNBG96611020345678', friendlyName: 'Test Account', role: 'DST',
  email: 'merchant@example.com', status: 'CONFIRMED', statusMessage: 'Test',
  pois: [{ name: 'Till 1' }], payload: { b: 1, a: 2 }, type: 'headers', operation: 'authentication',
  dataset: 'currencies', jwtToken: 'x.y.z',
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
  payware_operations_finalize_transaction: { amount: '10.00', fee: '0.10', currency: 'EUR' },
  payware_products_update_audio: { title: 'Jingle' },
  payware_utils_format_request: { jwtToken: 'x.y.z' }
};

/**
 * Bodies the server returns, where the handler reads one. Shapes are the server's DTOs: the report,
 * request and POI listings are JSON arrays (List<ReportDTO>, List<ReportRequestDTO>,
 * List<POIResponse>).
 */
const RESPONSES = {
  payware_data_list_reports: [{ reportUnitId: '/processedTransactionsMTD', name: 'Processed transactions' }],
  payware_data_get_report_requests: [],
  payware_data_get_export_list: [],
  payware_data_export_report: { outputResource: { exportId: EXPORT, status: 'QUEUED' } },
  payware_poi_list: [],
  payware_campaigns_list_campaigns: [],
  payware_products_list_placements: [],
  payware_products_list_airings: [],
  payware_products_replace_airings: [],
  payware_products_get_next_airings: [],
  payware_products_get_airing_calendar: [],
  payware_products_get_placement_link: `https://go.payware.eu/${PLACEMENT}`
};

const { publicKey, privateKey } = generateTestKeyPair();
let server;
let dir;
let env;

before(async () => {
  server = new FakePaywareServer({ publicKey });
  await server.start();
  dir = await mkdtemp(join(tmpdir(), 'payware-mcp-routes-'));
  const keyPath = join(dir, 'test-private-key.pem');
  await writeFile(keyPath, privateKey, 'utf8');
  // Two tools upload a local file. The bytes only have to exist; the fake server does not decode them.
  SAMPLE.audioPath = join(dir, 'jingle.mp3');
  SAMPLE.filePath = join(dir, 'soundbite.wav');
  await writeFile(SAMPLE.audioPath, Buffer.from('ID3 test audio'));
  await writeFile(SAMPLE.filePath, Buffer.from('RIFF test audio'));
  env = {
    PAYWARE_PARTNER_ID: 'TESTPRTN',
    // The data, logs and some product tools always use production; both point at the fake server.
    PAYWARE_SANDBOX_URL: server.url,
    PAYWARE_PRODUCTION_URL: server.url,
    PAYWARE_SANDBOX_PRIVATE_KEY_PATH: keyPath,
    PAYWARE_PRODUCTION_PRIVATE_KEY_PATH: keyPath,
    // Cleared, not inherited: src/config/env.js loads the working directory's .env, so on a developer's
    // machine these held real values and the OAuth2 tools passed here while failing in CI, which has none.
    PAYWARE_OAUTH_CLIENT_ID: undefined,
    PAYWARE_OAUTH_CLIENT_SECRET: undefined,
    PAYWARE_DEFAULT_MERCHANT_ID: undefined
  };
});

after(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

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

describe('every tool reaches the route the server has', () => {
  test('every tool declares its route', () => {
    const missing = ROLES.flatMap(r => r.tools.map(t => t.name)).filter(n => !(n in ROUTES));
    assert.deepEqual([...new Set(missing)], [], 'add these to ROUTES, with the route from the server controller');
  });

  for (const role of ROLES) {
    describe(role.name, () => {
      for (const tool of role.tools) {
        test(tool.name, async () => {
          const args = argsFor(tool);
          server.requests.length = 0;
          server.queue.length = 0;
          if (tool.name in RESPONSES) server.respondWith(200, RESPONSES[tool.name]);

          const result = await withEnv({ ...env, PAYWARE_PARTNER_TYPE: role.name }, () => tool.handler(args));

          const expected = ROUTES[tool.name];
          const sent = server.requests.map(r => `${r.method} ${r.path}`);
          assert.deepEqual(sent, expected === null ? [] : [expected]);

          for (const req of server.requests) {
            assert.equal(req.jwt.signatureValid, true, `${req.method} ${req.path}: JWT does not verify`);
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

          // The annotations must agree with the route. A route-less tool is local; a read-only one
          // may only GET (one POST renders an image and stores nothing); anything that PATCHes, PUTs
          // or DELETEs overwrites or removes, which is what destructiveHint is for.
          const hints = tool.annotations;
          if (expected === null) {
            assert.deepEqual([hints.readOnlyHint, hints.openWorldHint], [true, false], 'a local tool is read-only and closed-world');
          } else {
            const method = expected.split(' ')[0];
            assert.equal(hints.openWorldHint, true, 'a tool that calls payware is open-world');
            if (hints.readOnlyHint) {
              assert.ok(method === 'GET' || READ_ONLY_POSTS.has(tool.name), `declared read-only, but sends ${method}`);
            }
            if (['PATCH', 'PUT', 'DELETE'].includes(method)) {
              assert.equal(hints.destructiveHint, true, `sends ${method}, so it is destructive`);
            }
          }

          const parsed = CallToolResultSchema.safeParse(result);
          assert.ok(parsed.success, `not a valid tools/call result: ${parsed.error?.message}`);
          assert.ok(result.content.length > 0 && result.content.every(c => c.type !== 'text' || c.text.length > 0),
            'a result must say something');
          assert.notEqual(result.isError, true, `answered as an error: ${result.content[0]?.text?.slice(0, 200)}`);
        });
      }
    });
  }
});

describe('routes that depend on the arguments', () => {
  test('moving an audio to another product is a transfer, not an update', async () => {
    const tool = getMerchantTools().find(t => t.name === 'payware_products_update_audio');
    server.requests.length = 0;
    await withEnv({ ...env, PAYWARE_PARTNER_TYPE: 'merchant' },
      () => tool.handler({ productId: PRODUCT, audioId: AUDIO, newProductId: 'pr87654321' }));
    assert.deepEqual(server.requests.map(r => `${r.method} ${r.path}`),
      [`POST /products/${PRODUCT}/audios/${AUDIO}/transfer`]);
    assert.equal(server.lastRequest.contentHashMatches, true);
  });
});

describe('placement tools', () => {
  test('a placement image asks for its type and format, and a PNG comes back as an image', async () => {
    const tool = getISVTools().find(t => t.name === 'payware_products_get_placement_image');
    server.requests.length = 0;
    server.respondWith(200, 'PNG-BYTES', { 'Content-Type': 'image/png' });

    const result = await withEnv({ ...env, PAYWARE_PARTNER_TYPE: 'isv' }, () => tool.handler({
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
    server.respondWith(400, {
      errorCode: 'ERR_INVALID_AIRING_RULE', message: 'Invalid airing rule.',
      rows: [{ index: 1, errorCode: 'ERR_INVALID_AIRING_WINDOW', message: 'Invalid airing window.' }]
    });

    const result = await withEnv({ ...env, PAYWARE_PARTNER_TYPE: 'merchant' }, () => tool.handler({
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

describe('local side effects', () => {
  test('a saved export goes to the temp directory and the result says where', async () => {
    // It was written to a fixed path on one developer's machine, which no other machine has.
    const { tmpdir: systemTmp } = await import('node:os');
    const { existsSync } = await import('node:fs');
    const tool = getMerchantTools().find(t => t.name === 'payware_data_download_export');
    server.respondWith(200, { rows: [] });

    const result = await withEnv({ ...env, PAYWARE_PARTNER_TYPE: 'merchant' },
      () => tool.handler({ exportId: EXPORT, saveToFile: true }));

    const saved = join(systemTmp(), 'payware-mcp-downloads', `report_${EXPORT.substring(0, 8)}.json`);
    try {
      assert.ok(existsSync(saved), `expected the export at ${saved}`);
      assert.ok(result.content[0].text.includes(saved), 'the result must name the file it wrote');
    } finally {
      await rm(saved, { force: true });
    }
  });
});
