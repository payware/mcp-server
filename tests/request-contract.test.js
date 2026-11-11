import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { withEnv } from './helpers/fake-payware.js';
import { startPayware } from './helpers/payware-model.js';

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
 *
 * The server is the model in helpers/payware-model.js: real paths (/api), a key per environment, and
 * the server's own refusals, so a request payware would refuse is refused here before any queued
 * answer is given.
 */

let payware;
let server;
let privateKey;

before(async () => {
  payware = await startPayware();
  server = payware.sandbox;
  privateKey = payware.privateKeys.sandbox;
  MERCHANT_AUTH.privateKey = privateKey;
  BANK_AUTH.privateKey = privateKey;
});

after(async () => {
  await payware.stop();
});

beforeEach(() => {
  payware.reset();
});

/** Run a tool in a role with the model and its sandbox key wired in. */
const asMerchant = fn => withEnv(payware.env('merchant'), fn);
const asIsv = fn => withEnv(payware.env('isv'), fn);
const asInstitution = fn => withEnv(payware.env('payment_institution'), fn);

const MERCHANT_AUTH = { partnerId: 'TESTMRCH', privateKey: null, useSandbox: true };
const BANK_AUTH = { partnerId: 'TESTBANK', privateKey: null, useSandbox: true };
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

describe('create transaction: deferred Merchant Leg', () => {
  // The merchant's per-transaction opt-in to a transfer that settles later (server
  // docs/execution-lock.md). It lives in trOptions and is sent only when true.
  test('sends trOptions.deferredAllowed when true', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678', deferredAllowed: true });

    await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '250.00', currency: 'EUR', reasonL1: 'Invoice 42', deferredAllowed: true
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'POST');
    assert.equal(req.path, '/api/transactions');
    assert.equal(req.json.trOptions.deferredAllowed, true);
    assert.ok(!('deferredAllowed' in req.json), 'it belongs in trOptions, not at the root');
    assert.equal(req.contentHashMatches, true);
  });

  test('omits it when not set or false', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');

    for (const deferredAllowed of [undefined, false]) {
      server.respondWith(200, {});
      await asMerchant(() => createTransaction({
        ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed
      }));
      assert.ok(!('deferredAllowed' in server.lastRequest.json.trOptions), `sent for deferredAllowed=${deferredAllowed}`);
    }
  });

  test('refuses it on a terminal sale before sending', async () => {
    // The server answers 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED: a till payment stays instant or internal.
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    const base = { ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed: true };

    for (const terminal of [{ producerPartnerId: 'ABC12345' }, { terminalId: 'term-1' }, { terminalManufacturer: 'Datecs' }]) {
      await assert.rejects(
        () => asMerchant(() => createTransaction({ ...base, ...terminal })),
        /ERR_DEFERRED_TRANSFER_NOT_ALLOWED/
      );
    }
    assert.equal(server.requests.length, 0, 'nothing should have been sent');
  });

  test('refuses a value that is not a boolean', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    await assert.rejects(
      () => asMerchant(() => createTransaction({
        ...MERCHANT_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed: 'true'
      })),
      /true or false/
    );
    assert.equal(server.requests.length, 0);
  });
});

describe('create transaction: deferred Merchant Leg, on behalf of a merchant', () => {
  // The same opt-in on the ISV's call for a merchant, which the server honours like the merchant's own.
  test('sends trOptions.deferredAllowed when true, on behalf of the merchant', async () => {
    const { createTransaction } = await import('../src/isv/transactions/create-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678', deferredAllowed: true });

    const result = await asIsv(() => createTransaction({
      ...ISV_AUTH, amount: '250.00', currency: 'EUR', reasonL1: 'Invoice 42', deferredAllowed: true
    }));

    const req = server.lastRequest;
    assert.equal(req.method, 'POST');
    assert.equal(req.path, '/api/transactions');
    assert.equal(req.json.trOptions.deferredAllowed, true);
    assert.ok(!('deferredAllowed' in req.json), 'it belongs in trOptions, not at the root');
    assert.equal(req.jwt.payload.aud, ISV_AUTH.merchantPartnerId, 'an on-behalf call is addressed to the merchant');
    assert.equal(req.contentHashMatches, true);
    assert.equal(result.deferredAllowed, true);
  });

  test('omits it when not set or false', async () => {
    const { createTransaction } = await import('../src/isv/transactions/create-transaction.js');

    for (const deferredAllowed of [undefined, false]) {
      server.respondWith(200, {});
      await asIsv(() => createTransaction({
        ...ISV_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed
      }));
      assert.ok(!('deferredAllowed' in server.lastRequest.json.trOptions), `sent for deferredAllowed=${deferredAllowed}`);
    }
  });

  test('refuses it on a terminal sale before sending', async () => {
    // The ISV tool never sends the producer or terminal fields, but a caller passing them with the
    // opt-in is describing a terminal sale, which the server refuses with ERR_DEFERRED_TRANSFER_NOT_ALLOWED.
    const { createTransaction } = await import('../src/isv/transactions/create-transaction.js');
    const base = { ...ISV_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed: true };

    for (const terminal of [{ producerPartnerId: 'ABC12345' }, { terminalId: 'term-1' }, { terminalManufacturer: 'Datecs' }]) {
      await assert.rejects(
        () => asIsv(() => createTransaction({ ...base, ...terminal })),
        /ERR_DEFERRED_TRANSFER_NOT_ALLOWED/
      );
    }
    assert.equal(server.requests.length, 0, 'nothing should have been sent');
  });

  test('refuses a value that is not a boolean', async () => {
    const { createTransaction } = await import('../src/isv/transactions/create-transaction.js');
    await assert.rejects(
      () => asIsv(() => createTransaction({
        ...ISV_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed: 'true'
      })),
      /true or false/
    );
    assert.equal(server.requests.length, 0);
  });

  test('the handler reports the refusal rather than sending', async () => {
    const tool = (await import('../src/isv/transactions/create-transaction.js')).createTransactionTool;
    const result = await asIsv(() => tool.handler({
      ...ISV_AUTH, amount: '10.00', currency: 'EUR', reasonL1: 'Test', deferredAllowed: true, terminalId: 'term-1'
    }));
    assert.match(result.content[0].text, /ERR_DEFERRED_TRANSFER_NOT_ALLOWED/);
    assert.equal(server.requests.length, 0);
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
    assert.equal(req.path, '/api/transactions/pw12345678');
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
    assert.equal(req.path, '/api/transactions/pw12345678');
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
    assert.equal(req.path, '/api/transactions/pw12345678');
    assert.ok(!('action' in req.json), '`action` is not a field on any payware request');
    assert.equal(req.json.trData.amount, '42.00');
    assert.equal(req.json.trData.currency, 'EUR');
    assert.equal(req.json.trData.reasonL1, 'Sale');
    assert.equal(req.contentHashMatches, true);
  });
});

describe('finalize transaction: the execution lock', () => {
  // server docs/execution-lock.md: EXECUTING immediately before money moves, carrying everything
  // payware checks, then CONFIRMED once the Merchant Leg has completed (or FAILED). All three are the
  // same PATCH; only the body differs.
  const finalize = async args => {
    const { finalizeTransaction } = await import('../src/payment-institution/transactions/finalize-transaction.js');
    return asInstitution(() => finalizeTransaction({ transactionId: 'pw12345678', ...BANK_AUTH, ...args }));
  };

  test('EXECUTING sends the amount, fee, currency and transfer type', async () => {
    server.respondWith(200, { transactionId: 'pw12345678', status: 'EXECUTING', transferType: 'INSTANT', fee: '1.34', feeVat: '0.22' });

    const result = await finalize({ status: 'EXECUTING', amount: '112.00', fee: '1.34', currency: 'EUR', transferType: 'INSTANT' });

    const req = server.lastRequest;
    assert.equal(req.method, 'PATCH');
    assert.equal(req.path, '/api/transactions/pw12345678');
    assert.deepEqual(req.json, { status: 'EXECUTING', amount: '112.00', fee: '1.34', currency: 'EUR', transferType: 'INSTANT' });
    assert.equal(req.contentHashMatches, true);
    assert.equal(result.success, true);
  });

  test('a zero fee is sent, not dropped', async () => {
    server.respondWith(200, {});
    await finalize({ status: 'EXECUTING', amount: '10.00', fee: 0, currency: 'EUR', transferType: 'INTERNAL' });
    assert.equal(server.lastRequest.json.fee, '0');
  });

  test('CONFIRMED after EXECUTING may carry just the status', async () => {
    server.respondWith(200, { transactionId: 'pw12345678', status: 'CONFIRMED' });

    await finalize({ status: 'CONFIRMED' });

    const req = server.lastRequest;
    assert.equal(req.method, 'PATCH');
    assert.equal(req.path, '/api/transactions/pw12345678');
    assert.deepEqual(req.json, { status: 'CONFIRMED' });
    assert.equal(req.contentHashMatches, true);
  });

  test('CONFIRMED still sends the locked values when the caller repeats them', async () => {
    // payware compares them with the lock (ERR_EXECUTION_MISMATCH), so the full body keeps working.
    server.respondWith(200, {});
    await finalize({ status: 'CONFIRMED', amount: '112.00', fee: '1.34', currency: 'EUR', transferType: 'INSTANT' });
    assert.deepEqual(server.lastRequest.json, { status: 'CONFIRMED', amount: '112.00', fee: '1.34', currency: 'EUR', transferType: 'INSTANT' });
  });

  test('FAILED carries its status message and fee leg outcome, and no amount', async () => {
    server.respondWith(200, {});
    await finalize({ status: 'FAILED', statusMessage: 'Merchant Leg rejected', feeLegOutcome: 'RETURNED', amount: '112.00' });
    assert.deepEqual(server.lastRequest.json, { status: 'FAILED', statusMessage: 'Merchant Leg rejected', feeLegOutcome: 'RETURNED' });
    assert.equal(server.lastRequest.contentHashMatches, true);
  });

  test('EXECUTING without what payware checks is refused before sending', async () => {
    const full = { status: 'EXECUTING', amount: '112.00', fee: '1.34', currency: 'EUR', transferType: 'INSTANT' };
    for (const [missing, pattern] of [['amount', /amount is required/], ['fee', /fee is required/],
      ['currency', /currency is required/], ['transferType', /ERR_MISSING_TRANSFER_TYPE/]]) {
      const { [missing]: _, ...args } = full;
      await assert.rejects(() => finalize(args), pattern, `EXECUTING without ${missing}`);
    }
    assert.equal(server.requests.length, 0, 'nothing should have been sent');
  });

  test('an unknown transfer type or fee leg outcome is refused before sending', async () => {
    await assert.rejects(
      () => finalize({ status: 'EXECUTING', amount: '1.00', fee: '0', currency: 'EUR', transferType: 'SEPA' }),
      /ERR_INVALID_TRANSFER_TYPE/
    );
    await assert.rejects(
      () => finalize({ status: 'FAILED', statusMessage: 'Rejected', feeLegOutcome: 'REFUNDED' }),
      /ERR_INVALID_FEE_LEG_OUTCOME/
    );
    assert.equal(server.requests.length, 0);
  });

  test('a fee leg outcome belongs to FAILED, and a transfer type to EXECUTING or CONFIRMED', async () => {
    await assert.rejects(() => finalize({ status: 'CONFIRMED', feeLegOutcome: 'NOT_EXECUTED' }), /FAILED only/);
    await assert.rejects(() => finalize({ status: 'DECLINED', statusMessage: 'Payer declined', transferType: 'INSTANT' }), /transferType/);
    assert.equal(server.requests.length, 0);
  });

  test('CONFIRMED from ACTIVE reaches the caller as ERR_NOT_EXECUTING, not retryable', async () => {
    server.respondWith(409, { errorCode: 'ERR_NOT_EXECUTING', message: 'The transaction is not executing.' });

    const result = await finalize({ status: 'CONFIRMED' });

    assert.equal(result.success, false);
    assert.equal(result.error.status, 409);
    assert.equal(result.error.errorCode, 'ERR_NOT_EXECUTING');
    assert.equal(result.error.retryable, false);
  });
});

describe('institution account', () => {
  // payware does not keep the payer's account: FIValidationService requires one only from the payee, at
  // creation (role DST) and at processing (a transaction its payer created). The tools required it always.
  test('the payer creating (SRC) sends no account, and the payee (DST) must', async () => {
    const { createPITransaction } = await import('../src/payment-institution/transactions/create-pi-transaction.js');
    const base = { ...BANK_AUTH, friendlyName: 'Jane Doe', amount: '10.00', currency: 'EUR', reasonL1: 'Test' };

    server.respondWith(200, { transactionId: 'pw12345678' });
    await asInstitution(() => createPITransaction({ ...base, role: 'SRC', account: 'BG80BNBG96611020345678' }));
    assert.ok(!('account' in server.lastRequest.json), 'an SRC create carries no account');
    assert.equal(server.lastRequest.contentHashMatches, true);

    server.respondWith(200, { transactionId: 'pw12345678' });
    await asInstitution(() => createPITransaction({ ...base, role: 'DST', account: 'BG80BNBG96611020345678' }));
    assert.equal(server.lastRequest.json.account, 'BG80BNBG96611020345678');

    server.requests.length = 0;
    await assert.rejects(() => asInstitution(() => createPITransaction({ ...base, role: 'DST' })), /required when creating as the payee/);
    assert.equal(server.requests.length, 0);
  });

  test('processing sends an account only when given', async () => {
    const { processPITransaction } = await import('../src/payment-institution/transactions/process-pi-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678' });

    await asInstitution(() => processPITransaction({
      ...BANK_AUTH, transactionId: 'pr12345678', friendlyName: 'Jane Doe', amount: '2.50', currency: 'EUR', reasonL1: 'Test'
    }));

    assert.ok(!('account' in server.lastRequest.json), 'the payer institution sends no account');
    assert.equal(server.lastRequest.json.friendlyName, 'Jane Doe');
    assert.equal(server.lastRequest.contentHashMatches, true);
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
    assert.equal(req.path, '/api/transactions-history/pw12345678');
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

    // The model answers ShopDTOs: the code is `code`.
    const result = await asMerchant(() => listShops({
      partnerType: 'merchant', partnerId: 'TESTMRCH', privateKey, useSandbox: true
    }));

    assert.equal(server.lastRequest.method, 'GET');
    assert.equal(server.lastRequest.path, '/api/shops');
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });

  test('the list tool shows each shop by its code', async () => {
    const { getMerchantTools } = await import('../src/merchant/index.js');
    const list = getMerchantTools().find(t => t.name === 'payware_shops_list');
    const result = await asMerchant(() => list.handler({}));
    assert.match(result.content[0].text, /`SHOP01` \(default, BG\)/);
    assert.doesNotMatch(result.content[0].text, /undefined/);
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
    assert.equal(req.path, '/api/poi');
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
    assert.equal(req.path, '/api/poi/batch');
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
    // The model answers LegalFormDTOs (id, code, acronym, extensiveTitle).
    await asIsv(() => getReferenceData({
      dataset: 'legal-forms', jurisdictionCode: 'bg', partnerId: 'TESTISV1', privateKey
    }));

    assert.equal(server.lastRequest.path, '/api/isv/reference/legal-forms');
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
    assert.equal(req.path, '/api/isv/invitations');
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
    assert.equal(server.lastRequest.path, '/api/isv/invitations/42');
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

describe('Idempotency-Key', () => {
  // A bank retrying "pay this product" after a timeout made a second payment until the server learned
  // the header (2026-10-14). The tools pass it through, and only when the caller gives one.
  test('is sent when given, and a replay is reported', async () => {
    const { processPITransaction } = await import('../src/payment-institution/transactions/process-pi-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678', status: 'ACTIVE' }, { 'Idempotent-Replayed': 'true' });

    const result = await asMerchant(() => processPITransaction({
      ...MERCHANT_AUTH, transactionId: 'pr12345678', account: 'ACC1', friendlyName: 'Payer',
      amount: '2.50', currency: 'EUR', reasonL1: 'Test', idempotencyKey: '6f1c9a1e-3d4b-4c55-9a7e-2b1f0e8d7c6a'
    }));

    assert.equal(server.lastRequest.headers['idempotency-key'], '6f1c9a1e-3d4b-4c55-9a7e-2b1f0e8d7c6a');
    assert.equal(server.lastRequest.contentHashMatches, true);
    assert.equal(result.replayed, true);
  });

  test('is absent when not given, as before', async () => {
    const { createTransaction } = await import('../src/merchant/transactions/create-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678' });

    const result = await asMerchant(() => createTransaction({
      ...MERCHANT_AUTH, amount: '1.00', currency: 'EUR', reasonL1: 'Test'
    }));

    assert.equal(server.lastRequest.headers['idempotency-key'], undefined);
    assert.equal(result.replayed, false);
  });

  test('reaches the wire on the ISV tools too', async () => {
    const { processTransaction } = await import('../src/isv/transactions/process-transaction.js');
    server.respondWith(200, { transactionId: 'pw12345678', status: 'ACTIVE' });

    await asIsv(() => processTransaction({
      ...ISV_AUTH, transactionId: 'pr12345678', amount: '1.00', currency: 'EUR', reasonL1: 'Test',
      idempotencyKey: 'isv-retry-1'
    }));

    assert.equal(server.lastRequest.headers['idempotency-key'], 'isv-retry-1');
  });
});

/**
 * The fixes of the 2026-11-10 review, each as what a client sees: the tools as the role registries
 * serve them (wrapped, so a failure is an isError result), against the model.
 */
describe('as a client sees the tools', () => {
  const tools = {};
  before(async () => {
    tools.merchant = (await import('../src/merchant/index.js')).getMerchantTools();
    tools.isv = (await import('../src/isv/index.js')).getISVTools();
    tools.payment_institution = (await import('../src/payment-institution/index.js')).getPaymentInstitutionTools();
  });
  const call = (role, name, args) => withEnv(payware.env(role),
    () => tools[role].find(t => t.name === name).handler(args));
  const text = result => result.content.map(c => c.text ?? '').join('\n');

  test('create_jwt_token shows the exact body it hashed, and signs with the environment asked for', async () => {
    const { createHash } = await import('node:crypto');
    const jwt = (await import('jsonwebtoken')).default;
    const result = await call('merchant', 'payware_authentication_create_jwt_token', {
      requestBody: { trData: { reasonL1: 'Test', amount: '1.00' }, b: 1 }, useSandbox: false
    });
    const body = /Send exactly this body[\s\S]*?```json\n(.*)\n```/.exec(text(result))[1];
    const token = /\*\*Token:\*\*\n```\n(.*)\n```/.exec(text(result))[1];
    const decoded = jwt.verify(token, payware.production.publicKey, { complete: true });
    assert.equal(decoded.header.contentSha256, createHash('sha256').update(body).digest('base64'));
    assert.deepEqual(JSON.parse(body), { trData: { reasonL1: 'Test', amount: '1.00' }, b: 1 });
  });

  test('format_request writes a curl body on one line, with Api-Version and no invented header', async () => {
    const result = await call('merchant', 'payware_utils_format_request', {
      type: 'curl', jwtToken: 'x.y.z', endpoint: 'https://sandbox.payware.eu/api/transactions', method: 'POST',
      data: { trData: { amount: '1.00', currency: 'EUR' } }
    });
    assert.match(text(result), /--data-binary '\{"trData":\{"amount":"1.00","currency":"EUR"\}\}'/);
    assert.match(text(result), /Api-Version: 1/);
    assert.doesNotMatch(text(result), /X-Signature/);
  });

  test('an OAuth2 failure is an error and does not print the request headers', async () => {
    const result = await call('isv', 'payware_authorization_oauth2_obtain_token', { clientId: 'TESTMRCH', clientSecret: 'wrong' });
    assert.equal(result.isError, true);
    assert.match(text(result), /ERR_CLIENT_NOT_FOUND/);
    assert.doesNotMatch(text(result), /Bearer|Authorization/);
  });

  test('an ISV lists its tokens and rotates one, at the host root', async () => {
    const listed = await call('isv', 'payware_authorization_oauth2_list_tokens', {});
    assert.equal(server.lastRequest.path, '/oauth2/tokens');
    assert.match(text(listed), /test-oauth2-token/);
    assert.match(text(listed), /PZAYNMVE/);
    const rotated = await call('isv', 'payware_authorization_oauth2_rotate_token', { token: 'test-oauth2-token' });
    assert.equal(server.lastRequest.path, '/oauth2/tokens/test-oauth2-token/rotate');
    assert.notEqual(rotated.isError, true);
  });

  test('an institution create without an amount sends the flexible 0.00 with its currency', async () => {
    const result = await call('payment_institution', 'payware_operations_create_transaction', {
      role: 'SRC', account: 'BG80BNBG96611020345678', friendlyName: 'Jane', currency: 'EUR'
    });
    assert.deepEqual(server.lastRequest.json.trData, { amount: '0.00', currency: 'EUR' });
    assert.notEqual(result.isError, true);
  });

  test('an institution process without an amount is refused before it is sent', async () => {
    const result = await call('payment_institution', 'payware_operations_process_transaction', {
      transactionId: 'pw12345678', friendlyName: 'Jane', currency: 'EUR', reasonL1: 'Test'
    });
    assert.equal(result.isError, true);
    assert.equal(server.requests.length, 0);
  });

  test('a status summary reads the fields TransactionDTO has', async () => {
    const result = await call('merchant', 'payware_operations_get_transaction_status', { transactionId: 'pw12345678' });
    assert.match(text(result), /- ID: pw12345678/);
    assert.match(text(result), /- Amount: 10\.00 EUR/);
    assert.match(text(result), /- Reason: Test/);
  });

  test('simulated callbacks carry feeVat beside fee, in every role', async () => {
    for (const role of ['merchant', 'isv', 'payment_institution']) {
      const result = await call(role, 'payware_operations_simulate_callback', { transactionId: 'pw12345678', fee: '0.29' });
      assert.match(text(result), /"feeVat": "0\.00"/, role);
    }
  });

  test('reference rows show each dataset\'s own label', async () => {
    const result = await call('isv', 'payware_reference_lookup', { dataset: 'legal-forms', jurisdictionCode: 'BG' });
    assert.match(text(result), /`3` ООД - Дружество с ограничена отговорност/);
  });

  test('an invitation read does not promise its link, and points a completed one at the tokens', async () => {
    const result = await call('isv', 'payware_isv_get_invitation', { invitationId: 42 });
    assert.match(text(result), /re-issue it in the payware portal/);
    const tool = tools.isv.find(t => t.name === 'payware_isv_get_invitation');
    assert.match(tool.description, /It does not return the link/);
  });

  test('a merchant gets its POI QR code as an image, whole', async () => {
    const result = await call('merchant', 'payware_poi_get_qrcode', { poiId: 'piABC12345' });
    assert.equal(server.lastRequest.jwt.payload.aud, 'https://payware.eu', 'a merchant signs for itself');
    assert.equal(result.content[0].type, 'image');
    assert.equal(Buffer.from(result.content[0].data, 'base64').toString('hex'), '89504e470d0a1a0a');
  });

  test('soundbite: nothing recognised is not an error, and capacity says when to retry', async () => {
    const { writeFile, mkdtemp } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const filePath = join(await mkdtemp(join(tmpdir(), 'payware-sb-')), 'soundbite.bin');
    await writeFile(filePath, Buffer.from('fingerprint'));

    payware.soundbiteSandbox.respondWith(200, '');
    const nothing = await call('payment_institution', 'payware_operations_soundbite_transaction', { filePath });
    assert.match(text(nothing), /Nothing recognised/);
    assert.notEqual(nothing.isError, true);

    payware.soundbiteSandbox.respondWith(503, { errorCode: 'ERR_RECOGNITION_BUSY', message: 'Busy.' }, { 'Retry-After': '2' });
    const busy = await call('payment_institution', 'payware_operations_soundbite_transaction', { filePath });
    assert.equal(busy.isError, true);
    assert.match(text(busy), /Retry-After: 2 seconds/);
    assert.equal(payware.sandbox.requests.length, 0, 'recognition never goes to the API host');
  });

  // payware keeps every stored value a PATCH leaves out (server 2026-11-11). Until 2.2.0 both tools read
  // first and sent everything, which echoed the stored start date: refused once it is before today.
  test('update_product sends only what the caller gave, and reads nothing first', async () => {
    await call('merchant', 'payware_products_update_product', { productId: 'pr12345678', name: 'Tea' });
    assert.deepEqual(server.requests.map(r => `${r.method} ${r.path}`), ['PATCH /api/products/pr12345678']);
    assert.deepEqual(server.lastRequest.json, { name: 'Tea' });
  });

  test('update_product nests only the product data it was given', async () => {
    await call('merchant', 'payware_products_update_product', { productId: 'pr12345678', regularPrice: '3.10' });
    assert.deepEqual(server.lastRequest.json, { prData: { regularPrice: '3.10' } });
  });

  test('update_schedule sends only what the caller gave, and reads nothing first', async () => {
    await call('merchant', 'payware_products_update_schedule', { productId: 'pr12345678', scheduleId: 11, description: 'Late hour' });
    assert.deepEqual(server.requests.map(r => `${r.method} ${r.path}`), ['PATCH /api/products/pr12345678/schedules/11']);
    assert.deepEqual(server.lastRequest.json, { description: 'Late hour' });
  });

  test('an update naming a start before today is refused, as payware refuses it', async () => {
    const result = await call('merchant', 'payware_products_update_product', { productId: 'pr12345678', activeFrom: '2020-01-01' });
    assert.equal(result.isError, true);
    assert.match(text(result), /ERR_INVALID_ACTIVE_FROM_DATE/);
  });

  test('an ISV runs a merchant\'s report with the merchant\'s token and its own without one, and polls each in its own context', async () => {
    const onBehalf = { merchantPartnerId: 'PZAYNMVE', oauth2Token: 'test-oauth2-token' };
    const forMerchant = await call('isv', 'payware_data_generate_report', { reportUnitId: 'processedTransactions', ...onBehalf });
    const signed = payware.production.lastRequest.jwt.payload;
    assert.deepEqual([signed.aud, signed.sub], ['PZAYNMVE', 'test-oauth2-token']);
    assert.match(text(forMerchant), /Acting for merchant: PZAYNMVE/);
    assert.doesNotMatch(text(forMerchant), /test-oauth2-token/, 'the merchant\'s token never goes into a result');

    const forItself = await call('isv', 'payware_data_generate_report', { reportUnitId: 'processedTransactions' });
    const own = payware.production.lastRequest.jwt.payload;
    assert.deepEqual([own.iss, own.aud, own.sub], ['TESTISV1', 'https://payware.eu', undefined]);
    assert.match(text(forItself), /Called for your ISV itself/);

    const requestId = /Request ID: (\S+)/.exec(text(forMerchant))[1];
    const sameContext = await call('isv', 'payware_data_get_report_status', { requestId, ...onBehalf });
    assert.notEqual(sameContext.isError, true);
    const otherContext = await call('isv', 'payware_data_get_report_status', { requestId });
    assert.equal(otherContext.isError, true);
    assert.match(text(otherContext), /ERR_REPORT_REQUEST_NOT_FOUND/);
  });

  test('an ISV gives the merchant and its token together or not at all', async () => {
    const before = payware.production.requests.length;
    const result = await call('isv', 'payware_data_generate_report', { reportUnitId: 'processedTransactions', merchantPartnerId: 'PZAYNMVE' });
    assert.equal(result.isError, true);
    assert.match(text(result), /together/);
    assert.equal(payware.production.requests.length, before, 'nothing is sent');
  });

  test('reports: the unit id sent is the last segment of the report path, and only the server\'s formats are offered', async () => {
    const result = await call('merchant', 'payware_data_generate_report', { reportUnitId: '/reports/payware/processedTransactions' });
    assert.equal(payware.production.lastRequest.json.reportUnitId, 'processedTransactions');
    assert.notEqual(result.isError, true);
    const exportTool = tools.merchant.find(t => t.name === 'payware_data_export_report');
    assert.deepEqual([...exportTool.inputSchema.properties.outputFormat.enum].sort(),
      ['csv', 'docx', 'html', 'odt', 'ods', 'pdf', 'rtf', 'xls', 'xlsx', 'xml'].sort());
  });

  test('a tool that throws is an isError result, not a JSON-RPC error', async () => {
    const result = await call('payment_institution', 'payware_operations_finalize_transaction', {
      transactionId: 'pw12345678', status: 'CONFIRMED', feeLegOutcome: 'RETURNED'
    });
    assert.equal(result.isError, true);
    assert.match(text(result), /feeLegOutcome is sent with FAILED only/);
  });

  test('institutions have the logs tools; the level filter is an exact match', async () => {
    const query = tools.payment_institution.find(t => t.name === 'payware_logs_query');
    assert.ok(query, 'LogAccessController serves institutions');
    assert.match(query.inputSchema.properties.level.description, /exact match/);
    await call('payment_institution', 'payware_logs_query', { level: 'ERROR', useSandbox: false });
    assert.equal(payware.production.lastRequest.query.level, 'ERROR');
  });
});
