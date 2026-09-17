import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakePaywareServer, withEnv } from './helpers/fake-payware.js';
import { generateTestKeyPair } from './helpers/keys.js';

/**
 * What actually goes on the wire.
 *
 * These run the real tool code against a local HTTP server with nothing stubbed - JWT signing,
 * deterministic serialization, headers and body all execute for real. That is deliberate: the
 * failures this package has had are wire-level (a hash over the wrong string, a field spelled the
 * old way, a verb that matches no route), and none of them are visible to a test that mocks the
 * HTTP client.
 *
 * Every test asserts `contentHashMatches` on a request that has a body. That single assertion covers
 * the most common integration failure here - `ERR_INVALID_CONTENT_HASH`, which happens whenever the
 * string hashed into the JWT is not byte-identical to the body sent.
 */

const { publicKey, privateKey } = generateTestKeyPair();
let server;
let keyDir;
let keyPath;

before(async () => {
  server = new FakePaywareServer({ publicKey });
  await server.start();

  // The ISV tools read their key from PAYWARE_SANDBOX_PRIVATE_KEY_PATH rather than taking it as a
  // parameter, so the ephemeral key has to exist as a file. A fresh temp directory per run, never
  // the repo's own keys/ - those are gitignored, absent on CI, and real credentials locally.
  keyDir = await mkdtemp(join(tmpdir(), 'payware-mcp-test-'));
  keyPath = join(keyDir, 'test-private-key.pem');
  await writeFile(keyPath, privateKey, 'utf8');
});

after(async () => {
  await server.stop();
  await rm(keyDir, { recursive: true, force: true });
});

beforeEach(() => {
  server.requests.length = 0;
  server.queue.length = 0;
});

/** Run a merchant-role tool with the fake server and test credentials wired in. */
function asMerchant(fn) {
  return withEnv({
    PAYWARE_PARTNER_TYPE: 'merchant',
    PAYWARE_SANDBOX_URL: server.url,
    PAYWARE_PARTNER_ID: 'TESTMRCH',
    PAYWARE_SANDBOX_PRIVATE_KEY_PATH: keyPath
  }, fn);
}

/** Run an ISV-role tool. The partner type drives which JWT the factory builds. */
function asIsv(fn) {
  return withEnv({
    PAYWARE_PARTNER_TYPE: 'isv',
    PAYWARE_SANDBOX_URL: server.url,
    PAYWARE_PARTNER_ID: 'TESTISV1',
    PAYWARE_SANDBOX_PRIVATE_KEY_PATH: keyPath
  }, fn);
}

const MERCHANT_AUTH = { partnerId: 'TESTMRCH', privateKey, useSandbox: true };
const ISV_AUTH = { merchantPartnerId: 'PZAYNMVE', oauth2Token: 'test-oauth2-token', useSandbox: true };

describe('every signed request', () => {
  test('carries a contentSha256 that matches the body exactly', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678' });

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '25.50', currency: 'EUR', reasonL1: 'Test'
    }));

    const req = server.lastRequest;
    assert.equal(req.contentHashMatches, true,
      'contentSha256 does not match the body - this is ERR_INVALID_CONTENT_HASH in production');
  });

  test('is signed with the partner key and addressed to payware', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, {});

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '1.00', currency: 'EUR', reasonL1: 'Test'
    }));

    const { jwt } = server.lastRequest;
    assert.equal(jwt.signatureValid, true, 'JWT signature does not verify against the partner public key');
    assert.equal(jwt.header.alg, 'RS256');
    assert.equal(jwt.payload.aud, 'https://payware.eu', 'audience must be the full URL, not "payware"');
    assert.equal(jwt.payload.iss, 'TESTMRCH');
  });

  test('sends the Api-Version header', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, {});

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '1.00', currency: 'EUR', reasonL1: 'Test'
    }));

    // Omitting it is ERR_UNSUPPORTED_API_VERSION, a 400 on every endpoint.
    assert.equal(server.lastRequest.headers['api-version'], '1');
  });

  test('a GET carries no content hash', async () => {
    const { getTransactionStatus } = await import('../src/merchant/transactions/get-status.js');
    server.respondWith(200, { transactionId: 'pw12345678', status: 'ACTIVE' });

    await asMerchant(() => getTransactionStatus({ transactionId: 'pw12345678', ...MERCHANT_AUTH }));

    const req = server.lastRequest;
    assert.equal(req.rawBody, '', 'a GET must not send a body');
    assert.equal(req.jwt.header.contentSha256, undefined, 'a GET must not claim a content hash');
  });
});

describe('create transaction: producer attribution', () => {
  test('omits the producer fields entirely when not supplied', async () => {
    // Sending an empty producerPartnerId is not the same as omitting it: an unrecognised value
    // REJECTS the transaction, so an empty string turns "no producer" into a failed sale.
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, {});

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test'
    }));

    const body = server.lastRequest.json;
    assert.ok(!('producerPartnerId' in body), 'producerPartnerId must be absent, not empty');
    assert.ok(!('terminalId' in body));
    assert.ok(!('terminalManufacturer' in body));
  });

  test('sends all three when supplied', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, {});

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test',
      producerPartnerId: 'ABC12345', terminalId: 'term-1', terminalManufacturer: 'Datecs'
    }));

    const body = server.lastRequest.json;
    assert.equal(body.producerPartnerId, 'ABC12345');
    assert.equal(body.terminalId, 'term-1');
    assert.equal(body.terminalManufacturer, 'Datecs');
    assert.equal(server.lastRequest.contentHashMatches, true);
  });

  test('refuses an empty producerPartnerId before sending it', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');

    await assert.rejects(
      () => asMerchant(() => createTransaction({
        ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', producerPartnerId: '   '
      })),
      /must not be empty/
    );
    assert.equal(server.requests.length, 0, 'nothing should have been sent');
  });

  test('refuses an over-long or control-character terminalId', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    const base = { ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test' };

    await assert.rejects(
      () => asMerchant(() => createTransaction({ ...base, terminalId: 'x'.repeat(65) })),
      /cannot exceed 64/
    );
    await assert.rejects(
      () => asMerchant(() => createTransaction({ ...base, terminalManufacturer: 'bad\u0000name' })),
      /control characters/
    );
  });
});

describe('cancel transaction', () => {
  // Five bugs lived in the ISV transaction tools, and three of them were "calls a route that does
  // not exist". Asserting the verb and path is how that class of bug gets caught at all.
  test('merchant cancels with PATCH and a CANCELLED status body', async () => {
    const { cancelTransaction } = await import('../src/merchant/transactions/cancel-transaction.js');
    server.respondWith(200, { status: 'CANCELLED' });

    await asMerchant(() => cancelTransaction({
      transactionId: 'pw12345678', statusMessage: 'Customer changed their mind', ...MERCHANT_AUTH
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'PATCH');
    assert.equal(req.path, '/transactions/pw12345678');
    assert.equal(req.json.status, 'CANCELLED');
    assert.equal(req.json.statusMessage, 'Customer changed their mind');
    assert.equal(req.contentHashMatches, true);
  });

  test('ISV cancels the same way, not with DELETE', async () => {
    // Was `axios.delete` against /transactions/{id} with an empty body. There is no such route -
    // TransactionController has DELETE only on /{id}/link - so it 404'd every time.
    const { cancelTransaction } = await import('../src/isv/transactions/cancel-transaction.js');
    server.respondWith(200, { status: 'CANCELLED' });

    await asIsv(() => cancelTransaction({
      transactionId: 'pw12345678', statusMessage: 'Out of stock', ...ISV_AUTH
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'PATCH', 'cancel is PATCH; DELETE /transactions/{id} does not exist');
    assert.equal(req.path, '/transactions/pw12345678');
    assert.equal(req.json.status, 'CANCELLED');
    assert.equal(req.json.statusMessage, 'Out of stock');
    assert.equal(req.contentHashMatches, true);
  });

  test('ISV cancel requires a statusMessage', async () => {
    // The server throws MissingStatusMessageException for a cancel without one, and that path is
    // the ISV path too - it resolves the acting merchant through the on-behalf ISV.
    const { cancelTransaction } = await import('../src/isv/transactions/cancel-transaction.js');

    await assert.rejects(
      () => asIsv(() => cancelTransaction({ transactionId: 'pw12345678', ...ISV_AUTH })),
      /statusMessage is required/
    );
    assert.equal(server.requests.length, 0);
  });
});

describe('process transaction', () => {
  test('ISV processes with POST and a trData body, not PATCH with {action}', async () => {
    // Was PATCH {action:'CONFIRMED'}. PATCH is finalize, `action` is not a payware field, and a
    // merchant or its ISV may only send status CANCELLED there. Three reasons it could not work.
    const { processTransaction } = await import('../src/isv/transactions/process-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678', status: 'PROCESSED' });

    await asIsv(() => processTransaction({
      transactionId: 'pw12345678', amount: '42.00', currency: 'EUR', reasonL1: 'Sale', ...ISV_AUTH
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'POST', 'processing is POST /transactions/{id}; PATCH is finalize');
    assert.equal(req.path, '/transactions/pw12345678');
    assert.ok(!('action' in req.json), '`action` is not a field on any payware request');
    assert.equal(req.json.trData.amount, '42.00');
    assert.equal(req.json.trData.currency, 'EUR');
    assert.equal(req.json.trData.reasonL1, 'Sale');
    assert.equal(req.contentHashMatches, true);
  });
});

describe('transaction history', () => {
  test('ISV fetches one transaction by id, with no filter query', async () => {
    // Was GET /transactions-history?limit=&offset=&status=&from=&to=. There is no list endpoint -
    // TransactionHistoryController maps only /{transactionId} - so the bare path 404'd every time.
    const { getTransactionHistory } = await import('../src/isv/transactions/transaction-history.js');
    server.respondWith(200, { transactionId: 'pw12345678', status: 'CONFIRMED' });

    await asIsv(() => getTransactionHistory({ transactionId: 'pw12345678', ...ISV_AUTH }));

    const req = server.lastRequest;
    assert.equal(req.method, 'GET');
    assert.equal(req.path, '/transactions-history/pw12345678');
    assert.deepEqual(req.query, {}, 'there is no filtering on this endpoint');
  });

  test('ISV history requires a transactionId and says why', async () => {
    const { getTransactionHistory } = await import('../src/isv/transactions/transaction-history.js');

    await assert.rejects(
      () => asIsv(() => getTransactionHistory({ ...ISV_AUTH })),
      /no endpoint that lists or filters/
    );
  });
});

describe('shops', () => {
  test('lists from GET /shops', async () => {
    const { listShops } = await import('../src/shared/shops/shops-api.js');
    server.respondWith(200, [{ shopCode: 'SHOP01', name: 'Main store' }]);

    const result = await asMerchant(() => listShops({
      partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true
    }));

    assert.equal(server.lastRequest.method, 'GET');
    assert.equal(server.lastRequest.path, '/shops');
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });
});

describe('POI creation', () => {
  test('creates one POI at POST /poi', async () => {
    const { createPOI } = await import('../src/shared/poi/poi-create-api.js');
    server.respondWith(201, { poiId: 'piABC12345', name: 'Till 1', status: 'IDLE' });

    await asMerchant(() => createPOI({
      partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true,
      shopCode: 'SHOP01', name: 'Till 1'
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'POST');
    assert.equal(req.path, '/poi');
    assert.equal(req.json.shopCode, 'SHOP01');
    assert.equal(req.json.name, 'Till 1');
    assert.equal(req.contentHashMatches, true);
  });

  test('batches at POST /poi/batch with per-entry overrides', async () => {
    const { createPOIBatch } = await import('../src/shared/poi/poi-create-api.js');
    server.respondWith(201, { created: 2, pois: [{ poiId: 'pi1' }, { poiId: 'pi2' }] });

    await asMerchant(() => createPOIBatch({
      partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true,
      shopCode: 'SHOP01', ttlSeconds: 300,
      pois: [{ name: 'Till 1' }, { name: 'Till 2', ttlSeconds: 600 }]
    }));

    const req = server.lastRequest;
    assert.equal(req.path, '/poi/batch');
    assert.equal(req.json.shopCode, 'SHOP01');
    assert.equal(req.json.ttlSeconds, 300);
    assert.equal(req.json.pois.length, 2);
    assert.equal(req.json.pois[1].ttlSeconds, 600, 'per-entry override must survive');
    assert.equal(req.contentHashMatches, true);
  });

  test('refuses an empty or over-sized batch locally', async () => {
    const { createPOIBatch, MAX_POI_BATCH_SIZE } = await import('../src/shared/poi/poi-create-api.js');
    const base = { partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true, shopCode: 'S' };

    await assert.rejects(() => createPOIBatch({ ...base, pois: [] }), /ERR_BATCH_EMPTY/);
    await assert.rejects(
      () => createPOIBatch({ ...base, pois: Array.from({ length: MAX_POI_BATCH_SIZE + 1 }, () => ({})) }),
      /ERR_BATCH_TOO_LARGE/
    );
    assert.equal(server.requests.length, 0);
  });

  test('rejects a TTL outside 60-600', async () => {
    const { createPOI } = await import('../src/shared/poi/poi-create-api.js');
    const base = { partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true, shopCode: 'S' };

    await assert.rejects(() => createPOI({ ...base, ttlSeconds: 30 }), /between 60 and 600/);
    await assert.rejects(() => createPOI({ ...base, ttlSeconds: 900 }), /between 60 and 600/);
  });
});

describe('reference data', () => {
  test('requires jurisdictionCode for legal-forms, and says why it matters', async () => {
    // An unknown code is NOT rejected by the server - it falls back to a generic jurisdiction - so a
    // missing or wrong code returns a plausible but wrong list rather than an error.
    const { getReferenceData } = await import('../src/isv/reference/index.js');

    await assert.rejects(
      () => asIsv(() => getReferenceData({ dataset: 'legal-forms', partnerId: 'TESTISV1', privateKey })),
      /jurisdictionCode is required/
    );
  });

  test('sends jurisdictionCode uppercased', async () => {
    const { getReferenceData } = await import('../src/isv/reference/index.js');
    server.respondWith(200, [{ id: 1, name: 'OOD' }]);

    await asIsv(() => getReferenceData({
      dataset: 'legal-forms', jurisdictionCode: 'bg', partnerId: 'TESTISV1', privateKey
    }));

    assert.equal(server.lastRequest.path, '/isv/reference/legal-forms');
    assert.equal(server.lastRequest.query.jurisdictionCode, 'BG');
  });

  test('rejects an unknown dataset by name', async () => {
    const { getReferenceData } = await import('../src/isv/reference/index.js');
    await assert.rejects(
      () => getReferenceData({ dataset: 'nonsense', partnerId: 'TESTISV1', privateKey }),
      /Unknown dataset/
    );
  });
});

describe('ISV invitations', () => {
  test('creates at POST /isv/invitations', async () => {
    const { createInvitation } = await import('../src/isv/invitations/index.js');
    server.respondWith(201, {
      invitationId: 42, status: 'PENDING', type: 'REGISTRATION',
      email: 'merchant@example.com', invitationLink: 'https://my.payware.eu/invitation?t=abc'
    });

    await asIsv(() => createInvitation({
      partnerId: 'TESTISV1', privateKey, useSandbox: true,
      email: 'merchant@example.com', companyName: 'ACME Ltd', jurisdictionCode: 'BG'
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'POST');
    assert.equal(req.path, '/isv/invitations');
    assert.equal(req.json.email, 'merchant@example.com');
    assert.equal(req.json.companyName, 'ACME Ltd');
    assert.equal(req.contentHashMatches, true);
  });

  test('drops empty optional fields rather than sending blanks', async () => {
    const { createInvitation } = await import('../src/isv/invitations/index.js');
    server.respondWith(201, { invitationId: 1 });

    await asIsv(() => createInvitation({
      partnerId: 'TESTISV1', privateKey, useSandbox: true,
      email: 'a@b.com', companyName: '', phone: undefined
    }));

    const body = server.lastRequest.json;
    assert.ok(!('companyName' in body), 'an empty string must not be sent as a value');
    assert.ok(!('phone' in body));
  });

  test('rejects a malformed jurisdictionCode before sending', async () => {
    // 'BG' selects the Bulgarian commercial-registry path. A malformed code silently takes a
    // different branch server-side rather than failing, so it is worth catching here.
    const { createInvitation } = await import('../src/isv/invitations/index.js');
    await assert.rejects(
      () => createInvitation({ partnerId: 'TESTISV1', privateKey, email: 'a@b.com', jurisdictionCode: 'BGR' }),
      /two-letter ISO 3166-1/
    );
  });

  test('cancels with DELETE', async () => {
    const { cancelInvitation } = await import('../src/isv/invitations/index.js');
    server.respondWith(204, '');

    await asIsv(() => cancelInvitation({ invitationId: 42, partnerId: 'TESTISV1', privateKey, useSandbox: true }));

    assert.equal(server.lastRequest.method, 'DELETE');
    assert.equal(server.lastRequest.path, '/isv/invitations/42');
  });

  test('repeats the status filter rather than collapsing it', async () => {
    const { listInvitations } = await import('../src/isv/invitations/index.js');
    server.respondWith(200, { content: [], totalElements: 0, totalPages: 0, number: 0 });

    await asIsv(() => listInvitations({
      status: ['PENDING', 'EXPIRED'], partnerId: 'TESTISV1', privateKey, useSandbox: true
    }));

    const statuses = server.lastRequest.queryAll.filter(([k]) => k === 'status').map(([, v]) => v);
    assert.deepEqual(statuses, ['PENDING', 'EXPIRED']);
  });

  test('caps page size at 100', async () => {
    const { listInvitations } = await import('../src/isv/invitations/index.js');
    server.respondWith(200, { content: [] });

    await asIsv(() => listInvitations({ size: 5000, partnerId: 'TESTISV1', privateKey, useSandbox: true }));

    assert.equal(server.lastRequest.query.size, '100');
  });
});

describe('error responses reach the caller intact', () => {
  test('a 429 surfaces its code, retryability and Retry-After', async () => {
    const { getTransactionStatus } = await import('../src/merchant/transactions/get-status.js');
    server.respondWith(429, { errorCode: 'ERR_RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.' }, { 'Retry-After': '60' });

    const result = await asMerchant(() => getTransactionStatus({ transactionId: 'pw12345678', ...MERCHANT_AUTH }));

    assert.equal(result.success, false);
    assert.equal(result.error.status, 429);
    assert.equal(result.error.errorCode, 'ERR_RATE_LIMIT_EXCEEDED');
    assert.equal(result.error.retryable, true);
    assert.equal(result.error.retryAfterSeconds, 60);
  });

  test('a 403 explains the plan boundary', async () => {
    const { getTransactionStatus } = await import('../src/merchant/transactions/get-status.js');
    server.respondWith(403, { errorCode: 'ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN', message: 'Not in plan.' });

    const result = await asMerchant(() => getTransactionStatus({ transactionId: 'pw12345678', ...MERCHANT_AUTH }));

    assert.equal(result.error.errorCode, 'ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN');
    assert.match(result.error.guidance, /plan/i);
  });

  test('a 409 is reported as not retryable', async () => {
    const { processTransaction } = await import('../src/merchant/transactions/process-transaction.js');
    server.respondWith(409, { errorCode: 'ERR_ALREADY_PROCESSED', message: 'Request already processed.' });

    const result = await asMerchant(() => processTransaction({
      transactionId: 'pw12345678', amount: '10.00', currency: 'EUR', reasonL1: 'Test', ...MERCHANT_AUTH
    }));

    assert.equal(result.error.errorCode, 'ERR_ALREADY_PROCESSED');
    assert.equal(result.error.retryable, false);
  });
});
