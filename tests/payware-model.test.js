import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';

import { startPayware, IDS } from './helpers/payware-model.js';

/**
 * The model refuses what payware refuses.
 *
 * The other suites pass because the tools send what the model accepts; that only means something if
 * the model accepts what payware accepts and nothing more. These send raw requests, built here rather
 * than by the tools, and check each rule the model claims to enforce.
 */

let payware;

before(async () => {
  payware = await startPayware();
});

after(async () => {
  await payware.stop();
});

beforeEach(() => payware.reset());

/** A request as a client would build it, with every part overridable. */
async function send(host, { method = 'GET', path, body, iss = 'TESTMRCH', key = payware.privateKeys.sandbox,
  aud = 'https://payware.eu', sub, apiVersion = '1', hash, contentType = 'application/json' } = {}) {
  const raw = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
  const header = { alg: 'RS256', typ: 'JWT', ...(raw !== undefined && hash !== null && { contentSha256: hash ?? createHash('sha256').update(raw).digest('base64') }) };
  const token = jwt.sign({ iss, aud, ...(sub && { sub }), iat: Math.floor(Date.now() / 1000) }, key, { algorithm: 'RS256', header });
  const response = await fetch(`${host.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(apiVersion && { 'Api-Version': apiVersion }),
      ...(raw !== undefined && { 'Content-Type': contentType })
    },
    body: raw
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json, headers: response.headers };
}

describe('the payware model', () => {
  test('answers a correct request, with X-Correlation-ID', async () => {
    const r = await send(payware.sandbox, { path: '/api/shops' });
    assert.equal(r.status, 200);
    assert.equal(r.json[0].code, 'SHOP01');
    assert.equal(r.headers.get('x-correlation-id'), 'test-correlation-id');
  });

  test('refuses the other environment\'s key', async () => {
    const r = await send(payware.sandbox, { path: '/api/shops', key: payware.privateKeys.production });
    assert.deepEqual([r.status, r.json.errorCode], [401, 'ERR_INVALID_SIGNATURE']);
  });

  test('refuses a request without Api-Version on /api, and does not ask for one on /oauth2', async () => {
    const r = await send(payware.sandbox, { path: '/api/shops', apiVersion: null });
    assert.deepEqual([r.status, r.json.errorCode], [400, 'ERR_UNSUPPORTED_API_VERSION']);
    const oauth = await send(payware.sandbox, { path: '/oauth2/tokens', iss: 'TESTISV1', apiVersion: null });
    assert.equal(oauth.status, 200);
  });

  test('refuses a body without contentSha256, and one whose hash is not over the bytes sent', async () => {
    const body = { status: 'CANCELLED', statusMessage: 'Test' };
    const missing = await send(payware.sandbox, { method: 'PATCH', path: `/api/transactions/${IDS.TX}`, body, hash: null });
    assert.deepEqual([missing.status, missing.json.errorCode], [401, 'ERR_MISSING_CONTENT_HASH']);
    const pretty = JSON.stringify(body, null, 2);
    const wrong = await send(payware.sandbox, {
      method: 'PATCH', path: `/api/transactions/${IDS.TX}`, body: pretty,
      hash: createHash('sha256').update(JSON.stringify(body)).digest('base64')
    });
    assert.deepEqual([wrong.status, wrong.json.errorCode], [401, 'ERR_INVALID_CONTENT_HASH']);
  });

  test('refuses an unknown route, and a known one with the wrong verb', async () => {
    const unknown = await send(payware.sandbox, { path: '/transactions/pw12345678' });
    assert.equal(unknown.status, 404);
    const verb = await send(payware.sandbox, { method: 'DELETE', path: `/api/transactions/${IDS.TX}` });
    assert.equal(verb.status, 405);
  });

  test('sends recognition to the soundbite host only', async () => {
    // Sent with axios, as the tools send it, not with fetch: Node 18's fetch (undici 5) retries a 421 on a new
    // connection and cannot replay the body (UND_ERR_REQ_CONTENT_LENGTH_MISMATCH), and the matrix runs Node 18.
    const boundary = 'payware-test-boundary';
    const form = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="soundbite.bin"\r\n`
        + 'Content-Type: application/octet-stream\r\n\r\n'),
      Buffer.from('fingerprint'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const token = jwt.sign({ iss: 'TESTBANK', aud: 'https://payware.eu', iat: Math.floor(Date.now() / 1000) },
      payware.privateKeys.sandbox, { algorithm: 'RS256', header: { alg: 'RS256', typ: 'JWT' } });
    const headers = { Authorization: `Bearer ${token}`, 'Api-Version': '1',
      'Content-Type': `multipart/form-data; boundary=${boundary}` };
    const post = url => axios.post(url, form, { headers, validateStatus: () => true });
    const api = await post(`${payware.sandbox.url}/api/transactions`);
    assert.equal(api.status, 421);
    assert.equal(api.data.errorCode, 'ERR_SOUNDBITE_HOST');
    const soundbite = await post(`${payware.soundbiteSandbox.url}/api/transactions`);
    assert.equal(soundbite.status, 200);
  });

  test('refuses an ISV acting with a token it does not hold, and /oauth2 addressed to a merchant', async () => {
    const stranger = await send(payware.sandbox, { path: '/api/shops', iss: 'TESTISV1', aud: 'PZAYNMVE', sub: 'not-a-token' });
    assert.deepEqual([stranger.status, stranger.json.errorCode], [401, 'ERR_INVALID_TOKEN']);
    const held = await send(payware.sandbox, { path: '/api/shops', iss: 'TESTISV1', aud: 'PZAYNMVE', sub: IDS.OAUTH2_TOKEN });
    assert.equal(held.status, 200);
    const oauth = await send(payware.sandbox, { path: '/oauth2/tokens', iss: 'TESTISV1', aud: 'PZAYNMVE', sub: IDS.OAUTH2_TOKEN, apiVersion: null });
    assert.deepEqual([oauth.status, oauth.json.errorCode], [401, 'ERR_INVALID_AUDIENCE_FOR_OAUTH_REQUEST']);
  });

  test('refuses a report unit id that is a path', async () => {
    const r = await send(payware.production, { method: 'POST', path: '/api/data-retrieval', body: { reportUnitId: '/reports/payware/processedTransactions' }, key: payware.privateKeys.production });
    assert.deepEqual([r.status, r.json.errorCode], [400, 'ERR_VALIDATION_FAILED']);
  });

  test('refuses QR and barcode options outside the server\'s ranges', async () => {
    const base = { trData: { amount: '1.00', currency: 'EUR', reasonL1: 'Test' }, trOptions: { type: 'QR' } };
    for (const [qrOptions, code] of [
      [{ qrBorder: 0 }, 'ERR_INVALID_QR_BORDER'],
      [{ qrErrorCorrection: 'Q' }, 'ERR_INVALID_QR_ERROR_CORRECTION'],
      [{ qrFormat: 'GIF' }, 'ERR_INVALID_IMAGE_FORMAT']
    ]) {
      const r = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', body: { ...base, qrOptions } });
      assert.deepEqual([r.status, r.json.errorCode], [400, code], JSON.stringify(qrOptions));
    }
    const bar = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', body: { ...base, barOptions: { barBarHeight: 10 } } });
    assert.deepEqual([bar.status, bar.json.errorCode], [400, 'ERR_INVALID_BARCODE_BAR_HEIGHT']);
  });

  test('refuses an institution\'s create without an amount, and a process without one', async () => {
    const create = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', iss: 'TESTBANK', body: { role: 'SRC', trData: { currency: 'EUR' } } });
    assert.deepEqual([create.status, create.json.errorCode], [400, 'ERR_INVALID_AMOUNT']);
    const process = await send(payware.sandbox, { method: 'POST', path: `/api/transactions/${IDS.PRODUCT}`, iss: 'TESTBANK', body: { trData: { currency: 'EUR' } } });
    assert.deepEqual([process.status, process.json.errorCode], [400, 'ERR_INVALID_AMOUNT']);
  });

  // kb FI API, Payer pseudonym (optional, VG 2026-11-22): a value the payer's institution sends must be well formed,
  // in every environment; none at all is accepted; the payee's is ignored. authorisedAt goes with EXECUTING.
  test('takes a payer pseudonym or none, refuses a malformed or IBAN-shaped one from the payer\'s institution', async () => {
    const code = r => (r.status === 200 || r.status === 201 ? 'ok' : `${r.status} ${r.json.errorCode}`);
    const create = (host, extra) => send(host, { method: 'POST', path: '/api/transactions', iss: 'TESTBANK',
      key: host === payware.production ? payware.privateKeys.production : payware.privateKeys.sandbox,
      body: { role: 'SRC', friendlyName: 'Jane Doe', trData: { amount: '0.00', currency: 'EUR' }, ...extra } });
    const process = extra => send(payware.sandbox, { method: 'POST', path: `/api/transactions/${IDS.PRODUCT}`, iss: 'TESTBANK',
      body: { friendlyName: 'Jane Doe', trData: { amount: '2.50', currency: 'EUR' }, ...extra } });
    for (const host of [payware.sandbox, payware.production]) {
      assert.equal(code(await create(host, {})), 'ok', 'optional: none is accepted');
      assert.equal(code(await create(host, { payerPseudonym: 'c2f7e1a94b0d3e86a5f1c7d2e9b4a083' })), 'ok');
      for (const bad of ['too-short', 'BG80BNBG96611020345678', 'jane@example.com-12345', 'x'.repeat(65)]) {
        assert.equal(code(await create(host, { payerPseudonym: bad })), '400 ERR_INVALID_PAYER_PSEUDONYM', bad);
      }
    }
    assert.equal(code(await create(payware.sandbox, { role: 'DST', account: 'BG80BNBG96611020345678', payerPseudonym: 'too-short' })), 'ok', 'the payee\'s is ignored');
    assert.equal(code(await process({ payerPseudonym: 'BG80BNBG96611020345678' })), '400 ERR_INVALID_PAYER_PSEUDONYM');
    assert.equal(code(await process({ payerPseudonym: 'bank:cust.0042_x-9f3a' })), 'ok');
    // The IBAN shape alone is not refused, only an IBAN whose check digits are valid (PayerPseudonymService.looksLikeIban).
    assert.equal(code(await process({ payerPseudonym: 'BG81BNBG96611020345678' })), 'ok', 'IBAN shape, wrong check digits');
  });

  test('refuses an authorisedAt it cannot read, or one more than 5 seconds ahead, on EXECUTING', async () => {
    const patch = body => send(payware.sandbox, { method: 'PATCH', path: `/api/transactions/${IDS.TX}`, iss: 'TESTBANK', body });
    const lock = { status: 'EXECUTING', amount: '10.00', fee: '0.10', currency: 'EUR', transferType: 'INSTANT' };
    for (const bad of ['yesterday', '2026-11-22 10:15:30Z', new Date(Date.now() + 60000).toISOString()]) {
      const r = await patch({ ...lock, authorisedAt: bad });
      assert.deepEqual([r.status, r.json.errorCode], [400, 'ERR_INVALID_AUTHORISED_AT'], bad);
    }
    assert.equal((await patch({ ...lock, authorisedAt: new Date(Date.now() - 1000).toISOString() })).status, 200);
    // What java.time's ISO_OFFSET_DATE_TIME also reads (checked against Java 17, 2026-11-22).
    for (const good of ['2026-01-02T10:15Z', '2026-01-02t10:15:30z', '2026-01-02T12:15+02', '2026-01-02T12:15:30+02:00:00']) {
      assert.equal((await patch({ ...lock, authorisedAt: good })).status, 200, good);
    }
    for (const bad of ['2026-01-02T10:15:30', '2026-02-30T10:15Z', '2026-01-02T10:15+0200']) {
      const r = await patch({ ...lock, authorisedAt: bad });
      assert.deepEqual([r.status, r.json.errorCode], [400, 'ERR_INVALID_AUTHORISED_AT'], bad);
    }
  });

  test('holds the execution lock', async () => {
    const patch = body => send(payware.sandbox, { method: 'PATCH', path: `/api/transactions/${IDS.TX}`, iss: 'TESTBANK', body });
    assert.equal((await patch({ status: 'CONFIRMED' })).json.errorCode, 'ERR_NOT_EXECUTING');
    const lock = { status: 'EXECUTING', amount: '10.00', fee: '0.10', currency: 'EUR', transferType: 'INSTANT' };
    const locked = await patch(lock);
    assert.deepEqual([locked.status, locked.json.amount, locked.json.payerAmount], [200, '9.90', '10.00']);
    assert.equal((await patch(lock)).status, 200);
    assert.equal((await patch({ ...lock, fee: '0.20' })).json.errorCode, 'ERR_EXECUTION_MISMATCH');
    assert.equal((await patch({ status: 'CONFIRMED' })).status, 200);
    assert.equal((await patch({ status: 'DECLINED', statusMessage: 'x' })).json.errorCode, 'ERR_ALREADY_PROCESSED');
  });

  // Server V112 and DataRetrievalService (2026-11-11): an ISV runs its own reports with its own token
  // and a merchant's with the merchant's token, and each request is found only in the context it was run in.
  test('keeps an ISV\'s report requests apart: for itself, for a merchant, and from the merchant', async () => {
    const host = payware.production;
    const key = payware.privateKeys.production;
    const AS = {
      isv: { iss: 'TESTISV1', key },
      onBehalf: { iss: 'TESTISV1', aud: 'PZAYNMVE', sub: IDS.OAUTH2_TOKEN, key },
      merchant: { iss: 'PZAYNMVE', key }
    };
    const run = async who => (await send(host, { method: 'POST', path: '/api/data-retrieval', body: { reportUnitId: 'processedTransactions' }, ...AS[who] })).json.requestId;
    const forMerchant = await run('onBehalf');
    const forItself = await run('isv');
    assert.notEqual(forMerchant, forItself);

    const status = async (id, who) => {
      const r = await send(host, { path: `/api/data-retrieval/request/${id}/status`, ...AS[who] });
      return r.status === 200 ? 200 : `${r.status} ${r.json.errorCode}`;
    };
    assert.equal(await status(forMerchant, 'onBehalf'), 200);
    assert.equal(await status(forMerchant, 'isv'), '404 ERR_REPORT_REQUEST_NOT_FOUND');
    assert.equal(await status(forMerchant, 'merchant'), '404 ERR_REPORT_REQUEST_NOT_FOUND', 'the row carries the ISV\'s partner id');
    assert.equal(await status(forItself, 'isv'), 200);
    assert.equal(await status(forItself, 'onBehalf'), '404 ERR_REPORT_REQUEST_NOT_FOUND');

    const listed = async who => (await send(host, { path: '/api/data-retrieval/processedTransactions', ...AS[who] })).json.map(r => r.requestId);
    assert.deepEqual(await listed('onBehalf'), [forMerchant]);
    assert.deepEqual(await listed('isv'), [forItself]);
    assert.deepEqual(await listed('merchant'), []);

    const exported = await send(host, { method: 'POST', path: `/api/data-retrieval/request/${forMerchant}/export/pdf`, ...AS.onBehalf });
    const exportId = exported.json.outputResource.exportId;
    assert.equal((await send(host, { path: `/api/data-retrieval/export/${exportId}/download`, ...AS.onBehalf })).status, 200);
    const foreign = await send(host, { path: `/api/data-retrieval/export/${exportId}/status`, ...AS.isv });
    assert.deepEqual([foreign.status, foreign.json.errorCode], [404, 'ERR_REPORT_REQUEST_NOT_FOUND']);
    const cancel = await send(host, { method: 'PUT', path: `/api/data-retrieval/${forMerchant}/cancel`, ...AS.isv });
    assert.deepEqual([cancel.status, cancel.json.errorCode], [404, 'ERR_REPORT_REQUEST_NOT_FOUND']);
    assert.deepEqual((await send(host, { path: `/api/data-retrieval/exports/${forMerchant}`, ...AS.isv })).json, []);
  });

  test('refuses a TIP line in a merchant\'s own items: a tip is never a line (spec 24.1)', async () => {
    const body = items => ({ trData: { amount: '12.00', currency: 'EUR', reasonL1: 'Test' }, trOptions: { type: 'PLAIN' }, items });
    const coffee = { type: 'ITEM', name: 'Coffee', quantity: 1, unitPrice: '10.00', amount: '10.00' };
    const tipped = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', body: body([coffee, { type: 'TIP', name: 'Tip', amount: '2.00' }]) });
    assert.deepEqual([tipped.status, tipped.json.errorCode], [400, 'ERR_INVALID_ITEMS']);
    const taxed = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', body: body([coffee, { type: 'TAX', name: 'VAT', amount: '2.00' }]) });
    assert.equal(taxed.status, 200);
  });

  test('takes a merchant\'s own tip inside amount, at most the amount before it, with the lines adding up to amount minus tip (spec 24.1, D2)', async () => {
    const create = (trData, items, who = {}) => send(payware.sandbox, {
      method: 'POST', path: '/api/transactions', ...who,
      body: { trData: { currency: 'EUR', reasonL1: 'Table 4', ...trData }, trOptions: { type: 'PLAIN' }, ...(items && { items }) }
    });
    const code = r => (r.status === 200 ? 200 : `${r.status} ${r.json.errorCode}`);
    const coffee = amount => [{ type: 'ITEM', name: 'Coffee', quantity: 1, unitPrice: amount, amount }];
    assert.equal(code(await create({ amount: '12.00', tip: '2.00' })), 200);
    assert.equal(code(await create({ amount: '12.00', tip: '2.00' }, coffee('10.00'))), 200);
    assert.equal(code(await create({ amount: '12.00', tip: '2.00' }, coffee('12.00'))), '400 ERR_ITEMS_DO_NOT_SUM');
    assert.equal(code(await create({ amount: '12.00', tip: '6.00' })), 200, 'the tip may equal the amount before it');
    for (const tip of ['6.01', '12.00', '0', 'abc', '2.001']) {
      assert.equal(code(await create({ amount: '12.00', tip })), '400 ERR_INVALID_TIP', tip);
    }
    assert.equal(code(await create({ amount: '12.00', tip: '2.00' }, null, { iss: 'TESTBANK' })), '400 ERR_UNKNOWN_ROLE');
    const bank = await send(payware.sandbox, { method: 'POST', path: '/api/transactions', iss: 'TESTBANK', body: { role: 'DST', trData: { amount: '12.00', currency: 'EUR', tip: '2.00' } } });
    assert.equal(code(bank), '409 ERR_TIPS_NOT_ALLOWED', 'an institution creates no merchant payment');
  });

  test('refuses a timeToLive above the merchant\'s own ceiling: 600 by default, as raised, and the merchant\'s on behalf (spec 24.3)', async () => {
    const create = (timeToLive, who = {}) => send(payware.sandbox, {
      method: 'POST', path: '/api/transactions', ...who,
      body: { trData: { amount: '1.00', currency: 'EUR', reasonL1: 'Test' }, trOptions: { type: 'PLAIN', timeToLive } }
    });
    const code = r => (r.status === 200 ? 200 : `${r.status} ${r.json.errorCode}`);
    assert.equal(code(await create(600)), 200);
    assert.equal(code(await create(601)), '400 ERR_INVALID_TTL', 'TESTMRCH has the default ceiling');
    assert.equal(code(await create(59)), '400 ERR_INVALID_TTL');
    assert.equal(code(await create(2592000, { iss: 'PZAYNMVE' })), 200, 'PZAYNMVE raised its ceiling to 30 days');
    assert.equal(code(await create(2592001, { iss: 'PZAYNMVE' })), '400 ERR_INVALID_TTL');
    const onBehalf = { iss: 'TESTISV1', aud: 'PZAYNMVE', sub: IDS.OAUTH2_TOKEN };
    assert.equal(code(await create(2592000, onBehalf)), 200, 'an ISV gets the merchant\'s ceiling');
  });

  test('one tip rule for every payment: a malformed tip, a tip the payer may not add, and paying more without a tip are refused (spec 24.1)', async () => {
    const processing = (id, trData) => send(payware.sandbox, {
      method: 'POST', path: `/api/transactions/${id}`, iss: 'TESTBANK',
      body: { friendlyName: 'Jane Doe', trData: { currency: 'EUR', reasonL1: 'Test', ...trData } }
    });
    const code = r => (r.status === 200 ? 200 : `${r.status} ${r.json.errorCode}`);
    for (const tip of ['abc', '0', '0.00', '-1.00', '2.001', '1e2']) {
      assert.equal(code(await processing('pa12345678', { amount: '87.00', tip })), '400 ERR_INVALID_TIP', tip);
    }
    assert.equal(code(await processing('pa12345678', { amount: '87.00', tip: '2.00' })), 200);
    assert.equal(code(await processing(IDS.PRODUCT, { amount: '42.00', tip: '2.00' })), 200, 'an offer without quantity takes a tip too');
    assert.equal(code(await processing(IDS.PRODUCT, { amount: '82.00', quantity: 2, tip: '2.00' })), 200);
    assert.equal(code(await processing(IDS.POI, { amount: '12.00', tip: '2.00' })), 200, 'a POI sale takes a tip too');
    assert.equal(code(await processing(IDS.TX, { amount: '12.00', tip: '2.00' })), '409 ERR_TIPS_NOT_ALLOWED', 'the seeded pw\'s shop takes no tips');
    assert.equal(code(await processing(IDS.TIPPED, { amount: '24.00', tip: '2.00' })), '409 ERR_TIPS_NOT_ALLOWED', 'the merchant already put a tip on it');
    // The amount asked, exactly: no paying more without a tip, never less.
    assert.equal(code(await processing(IDS.TX, { amount: '10.00' })), 200);
    assert.equal(code(await processing(IDS.TX, { amount: '12.00' })), '409 ERR_AMOUNT_NOT_TOTAL');
    assert.equal(code(await processing(IDS.TX, { amount: '9.99' })), '400 ERR_INVALID_AMOUNT');
    assert.equal(code(await processing(IDS.TIPPED, { amount: '22.00' })), 200, 'the merchant\'s tip is inside the amount');
    assert.equal(code(await processing(IDS.TIPPED, { amount: '20.00' })), '400 ERR_INVALID_AMOUNT');
    const read = await send(payware.sandbox, { path: `/api/transactions/${IDS.TIPPED}`, iss: 'TESTBANK' });
    assert.deepEqual([read.json.amount, read.json.tip, read.json.tipsAllowed], ['22.00', '2.00', undefined]);
  });

  test('refuses a product start date before today, on create and on an update that names one', async () => {
    const r = await send(payware.sandbox, { method: 'PATCH', path: `/api/products/${IDS.PRODUCT}`, body: { prData: { activeFrom: '2020-01-01' } } });
    assert.deepEqual([r.status, r.json.errorCode], [400, 'ERR_INVALID_ACTIVE_FROM_DATE']);
    const kept = await send(payware.sandbox, { method: 'PATCH', path: `/api/products/${IDS.PRODUCT}`, body: { name: 'Tea' } });
    assert.equal(kept.status, 200, 'an update naming no date keeps the stored period');
  });
});
