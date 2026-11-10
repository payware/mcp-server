import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

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
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('fingerprint')]), 'soundbite.bin');
    const token = jwt.sign({ iss: 'TESTBANK', aud: 'https://payware.eu', iat: Math.floor(Date.now() / 1000) },
      payware.privateKeys.sandbox, { algorithm: 'RS256', header: { alg: 'RS256', typ: 'JWT' } });
    const headers = { Authorization: `Bearer ${token}`, 'Api-Version': '1' };
    const api = await fetch(`${payware.sandbox.url}/api/transactions`, { method: 'POST', headers, body: form });
    assert.equal(api.status, 421);
    assert.equal((await api.json()).errorCode, 'ERR_SOUNDBITE_HOST');
    const soundbite = await fetch(`${payware.soundbiteSandbox.url}/api/transactions`, { method: 'POST', headers, body: form });
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
});
