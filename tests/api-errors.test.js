import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { describeApiError, apiErrorResult, isRetryable, retryAfterSeconds } from '../src/shared/api-errors.js';

/** An axios-shaped failure. */
const axiosError = (status, data, headers = {}) => ({
  message: 'Request failed with status code ' + status,
  response: { status, data, headers }
});

describe('apiErrorResult', () => {
  test('reads the error code from errorCode, which is what payware sends', () => {
    // The regression this exists for. payware's error body is {errorCode, message, correlationId} -
    // there is no `code` property - and fourteen modules read `data.code`, so the machine-readable
    // half of every error was undefined while the message still came through. Nothing looked broken.
    const result = apiErrorResult(axiosError(400, {
      errorCode: 'ERR_INVALID_AMOUNT',
      message: 'Invalid transaction amount.'
    }));
    assert.equal(result.error.errorCode, 'ERR_INVALID_AMOUNT');
  });

  test('keeps `code` populated as an alias, so older callers still work', () => {
    const result = apiErrorResult(axiosError(400, { errorCode: 'ERR_INVALID_AMOUNT' }));
    assert.equal(result.error.code, 'ERR_INVALID_AMOUNT');
    assert.equal(result.error.code, result.error.errorCode);
  });

  test('carries the correlationId, which is what support needs', () => {
    const result = apiErrorResult(axiosError(500, {
      errorCode: 'ERR_TRY_AGAIN', correlationId: 'abc-123'
    }));
    assert.equal(result.error.correlationId, 'abc-123');
  });

  test('marks 429 and 503 retryable, and 400/403/409 not', () => {
    // The distinction is load-bearing: 429 and 503 both mean "the request was not applied", so the
    // identical request is safe to resend. A 409 also leaves state unchanged but resending it
    // conflicts again, which is a different instruction.
    assert.equal(apiErrorResult(axiosError(429, {})).error.retryable, true);
    assert.equal(apiErrorResult(axiosError(503, {})).error.retryable, true);
    assert.equal(apiErrorResult(axiosError(400, {})).error.retryable, false);
    assert.equal(apiErrorResult(axiosError(403, {})).error.retryable, false);
    assert.equal(apiErrorResult(axiosError(409, {})).error.retryable, false);
  });

  test('surfaces Retry-After seconds on a 429', () => {
    const result = apiErrorResult(axiosError(429, { errorCode: 'ERR_RATE_LIMIT_EXCEEDED' }, { 'retry-after': '60' }));
    assert.equal(result.error.retryAfterSeconds, 60);
  });

  test('attaches guidance for the universal statuses', () => {
    for (const status of [401, 403, 409, 429, 503]) {
      const result = apiErrorResult(axiosError(status, {}));
      assert.ok(result.error.guidance, `${status} should carry guidance`);
    }
  });

  test('mentions the merchant plan in the 403 guidance', () => {
    // A 403 on an ISV call is almost always the acting merchant's plan, not the ISV's credentials.
    // Without that hint the obvious next move is to re-check credentials that were never wrong.
    const result = apiErrorResult(axiosError(403, {}));
    assert.match(result.error.guidance, /merchant/i);
  });

  test('survives a network error with no response at all', () => {
    const result = apiErrorResult(new Error('ECONNREFUSED'));
    assert.equal(result.success, false);
    assert.equal(result.error.message, 'ECONNREFUSED');
    assert.equal(result.error.status, undefined);
    assert.equal(result.error.retryable, false);
  });
});

describe('describeApiError', () => {
  test('names the operation, the status and the code in one line', () => {
    const err = describeApiError(
      axiosError(409, { errorCode: 'ERR_ALREADY_PROCESSED', message: 'Request already processed.' }),
      'process transaction'
    );
    assert.match(err.message, /process transaction/);
    assert.match(err.message, /409/);
    assert.match(err.message, /ERR_ALREADY_PROCESSED/);
  });

  test('exposes status, code and retry info as properties, not only prose', () => {
    // A caller must be able to branch on this without parsing the message.
    const err = describeApiError(
      axiosError(429, { errorCode: 'ERR_RATE_LIMIT_EXCEEDED' }, { 'retry-after': '30' }),
      'get products'
    );
    assert.equal(err.status, 429);
    assert.equal(err.errorCode, 'ERR_RATE_LIMIT_EXCEEDED');
    assert.equal(err.retryable, true);
    assert.equal(err.retryAfterSeconds, 30);
  });

  test('says to back off even when Retry-After is missing from a 429', () => {
    // The filter always sets the header, so its absence means something sat between us and payware.
    // Answering "no idea" there would leave a retry loop with no delay at all.
    const err = describeApiError(axiosError(429, { errorCode: 'ERR_RATE_LIMIT_EXCEEDED' }), 'list shops');
    assert.match(err.message, /60 seconds/);
  });

  test('preserves the original error as `cause`', () => {
    const original = axiosError(400, { errorCode: 'ERR_INVALID_AMOUNT' });
    const err = describeApiError(original, 'create transaction');
    assert.equal(err.cause, original);
  });
});

describe('retryAfterSeconds', () => {
  test('parses delta-seconds', () => {
    assert.equal(retryAfterSeconds(axiosError(429, {}, { 'retry-after': '120' })), 120);
  });

  test('returns null for an HTTP-date rather than NaN', () => {
    // payware sends delta-seconds, but a proxy in front of it may send a date. Returning NaN would
    // put NaN into a setTimeout, which fires immediately - the exact opposite of backing off.
    assert.equal(retryAfterSeconds(axiosError(429, {}, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })), null);
  });

  test('returns null when the header is absent', () => {
    assert.equal(retryAfterSeconds(axiosError(429, {})), null);
  });

  test('returns null for a negative value', () => {
    assert.equal(retryAfterSeconds(axiosError(429, {}, { 'retry-after': '-5' })), null);
  });
});

describe('isRetryable', () => {
  test('is true only for 429 and 503', () => {
    assert.equal(isRetryable(429), true);
    assert.equal(isRetryable(503), true);
    for (const status of [200, 400, 401, 403, 404, 409, 500, 502]) {
      assert.equal(isRetryable(status), false, `${status} must not be reported retryable`);
    }
  });
});
