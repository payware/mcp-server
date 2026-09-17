import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createDeterministicJSON, createMinimizedJSON, validateJSONConsistency } from '../src/core/utils/json-serializer.js';
import { generateContentSha256 } from '../src/core/auth/jwt-token.js';

/**
 * Serialization determinism, which is the foundation the whole authentication scheme sits on.
 *
 * The JWT header carries a SHA-256 of the request body. If the string hashed and the string sent
 * differ by a single byte - a space, a key order, a re-serialization - payware answers
 * `ERR_INVALID_CONTENT_HASH` and the call fails with an error that points at authentication rather
 * than at serialization. That misdirection is why it deserves its own tests: the symptom names the
 * wrong subsystem.
 */

describe('createMinimizedJSON', () => {
  test('is stable across key insertion order', () => {
    // The case that matters in practice: two code paths build the same logical body with the
    // properties assigned in a different order, and only one of them hashes it.
    const a = createMinimizedJSON({ currency: 'EUR', amount: '10.00', reasonL1: 'Test' });
    const b = createMinimizedJSON({ reasonL1: 'Test', amount: '10.00', currency: 'EUR' });
    assert.equal(a, b);
  });

  test('is stable for nested objects too', () => {
    const a = createMinimizedJSON({ trData: { currency: 'EUR', amount: '1.00' }, shop: 'S1' });
    const b = createMinimizedJSON({ shop: 'S1', trData: { amount: '1.00', currency: 'EUR' } });
    assert.equal(a, b);
  });

  test('produces no incidental whitespace', () => {
    const json = createMinimizedJSON({ a: 1, b: { c: 2 } });
    assert.ok(!/\s/.test(json), `minimized JSON must contain no whitespace, got: ${json}`);
  });

  test('is idempotent', () => {
    // Serializing twice must not drift, or a retry would hash differently from the first attempt.
    const body = { amount: '10.00', currency: 'EUR', trOptions: { type: 'QR', timeToLive: 120 } };
    assert.equal(createMinimizedJSON(body), createMinimizedJSON(body));
  });

  test('preserves array order', () => {
    // Sorting keys must not sort arrays: a POI batch's entries are positional, and reordering them
    // would silently rename terminals.
    const json = createMinimizedJSON({ pois: [{ name: 'Till 3' }, { name: 'Till 1' }, { name: 'Till 2' }] });
    assert.match(json, /Till 3.*Till 1.*Till 2/);
  });

  test('keeps a price string a string', () => {
    // Product prices are decimal STRINGS on the wire since 2026-08-16. Coercing one to a number here
    // would reintroduce exactly the IEEE-754 truncation the change was made to avoid.
    const json = createMinimizedJSON({ regularPrice: '7305781205539490501730031805908445.87' });
    assert.match(json, /"regularPrice":"7305781205539490501730031805908445\.87"/);
  });
});

describe('createDeterministicJSON', () => {
  test('sorts keys', () => {
    const json = createDeterministicJSON({ zebra: 1, apple: 2, mango: 3 });
    assert.ok(json.indexOf('apple') < json.indexOf('mango'));
    assert.ok(json.indexOf('mango') < json.indexOf('zebra'));
  });
});

describe('validateJSONConsistency', () => {
  test('reports two differently-ordered but equal objects as consistent', () => {
    const result = validateJSONConsistency({ a: 1, b: 2 }, { b: 2, a: 1 });
    // The helper returns a report object; whatever its exact shape, the two must agree.
    const consistent = typeof result === 'boolean' ? result : (result.isConsistent ?? result.consistent ?? result.matches);
    assert.equal(consistent, true);
  });
});

describe('content hash', () => {
  test('the hash of the minimized body is what a caller must send as that body', () => {
    // This is the invariant in one line: hash(minimized) === hash(what goes on the wire), because
    // they are the same string. Any code that re-serializes between the two breaks it.
    const body = { amount: '10.00', currency: 'EUR', reasonL1: 'Test' };
    const minimized = createMinimizedJSON(body);

    const hashOfMinimized = generateContentSha256(minimized);
    const hashOfSameStringAgain = generateContentSha256(createMinimizedJSON(body));

    assert.equal(hashOfMinimized, hashOfSameStringAgain);
  });

  test('differs when the body differs', () => {
    const a = generateContentSha256(createMinimizedJSON({ amount: '10.00' }));
    const b = generateContentSha256(createMinimizedJSON({ amount: '10.01' }));
    assert.notEqual(a, b);
  });

  test('a re-serialized body hashes differently - the classic mistake', () => {
    // JSON.stringify does not sort keys, so hashing the minimized form and then sending
    // JSON.stringify(body) produces a mismatch whenever the key order differs. Pinning this keeps
    // the reason for `transformRequest: [(data) => data]` visible.
    // Note the declaration order: currency BEFORE amount. JSON.stringify preserves that;
    // createMinimizedJSON sorts it. Same object, two different strings, two different hashes.
    const body = { currency: 'EUR', amount: '10.00' };
    const minimized = createMinimizedJSON(body);
    const naive = JSON.stringify(body);

    assert.notEqual(minimized, naive,
      'if these ever match, the object was already in sorted order and this test proves nothing');
    assert.notEqual(generateContentSha256(minimized), generateContentSha256(naive),
      'hashing the minimized form and sending the naive form is ERR_INVALID_CONTENT_HASH');
  });

  test('is base64, not hex', () => {
    const hash = generateContentSha256('{}');
    assert.match(hash, /^[A-Za-z0-9+/]+=*$/);
    assert.equal(Buffer.from(hash, 'base64').length, 32, 'SHA-256 is 32 bytes');
  });
});
