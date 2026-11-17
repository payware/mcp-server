import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { withEnv } from './helpers/fake-payware.js';
import { startPayware, IDS } from './helpers/payware-model.js';

/**
 * The agentic commerce tools (delivery pricing, lines, purchase sessions), against the model of payware
 * for the merchant, ISV and institution tools and against a small link host for the payer tools.
 *
 * tool-routes.test.js already runs each of these tools once through ROUTES. This file asserts what that
 * cannot: the bodies and queries that go on the wire, the local checks, and the payer's behaviour.
 * The wire shapes are section 22 of the agentic commerce spec.
 */

const { PRODUCT, OAUTH2_TOKEN } = IDS;

let payware;
const as = (role, fn) => withEnv(payware.env(role), fn);

before(async () => {
  payware = await startPayware();
});
after(async () => {
  await payware.stop();
});

const { getMerchantTools } = await import('../src/merchant/index.js');
const { getISVTools } = await import('../src/isv/index.js');
const { getPaymentInstitutionTools } = await import('../src/payment-institution/index.js');
const { getPayerTools } = await import('../src/payer/index.js');
const { extractLinkId, sandboxFor, watchLink, sessionBody, FINAL_STATUSES, retryAfterSeconds } = await import('../src/payer/links-api.js');
const { ITEMS_PROPERTY, ITEMS_DESCRIPTION, ITEM_TYPES, LINE_TYPES, MERCHANT_TIP_PROPERTY, MERCHANT_TIP_DESCRIPTION } = await import('../src/shared/transaction-items.js');
const { CALLBACK_ITEMS_PROPERTY, CALLBACK_TIP_PROPERTY } = await import('../src/merchant/transactions/simulate-callback.js');
const { getLinksUrl } = await import('../src/config/env.js');

const tool = (tools, name) => tools.find(t => t.name === name);
const text = result => result.content.map(c => c.text ?? '').join('\n');

describe('delivery tools', () => {
  const ISV = { merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN };
  const SHOP_TABLE = [{ country: 'BG', currency: 'EUR', fee: '5.00', freeAbove: '50.00' }, { country: 'RO', currency: 'EUR', fee: '12.00' }];
  const PRODUCT_ROWS = [{ country: 'RO', excluded: true }, { country: 'BG', excluded: false, surchargePerUnit: '3.00' }];

  test('a merchant sets and reads a shop table: PUT replaces it, the body is exactly {countries}', async () => {
    payware.reset();
    const set = await as('merchant', () => tool(getMerchantTools(), 'payware_shops_set_delivery').handler({ shopCode: 'SHOP01', countries: SHOP_TABLE }));
    const req = payware.sandbox.lastRequest;
    assert.equal(`${req.method} ${req.path}`, 'PUT /api/shops/SHOP01/delivery');
    assert.deepEqual(req.json, { countries: SHOP_TABLE });
    assert.equal(req.contentHashMatches, true);
    assert.equal(req.jwt.payload.aud, 'https://payware.eu');
    assert.notEqual(set.isError, true);

    const got = await as('merchant', () => tool(getMerchantTools(), 'payware_shops_get_delivery').handler({ shopCode: 'SHOP01' }));
    assert.equal(`${payware.sandbox.lastRequest.method} ${payware.sandbox.lastRequest.path}`, 'GET /api/shops/SHOP01/delivery');
    assert.match(text(got), /"shopCode": "SHOP01"/);
  });

  test('an empty table is sent as an empty list, not left out: it means deliver anywhere with no fee', async () => {
    payware.reset();
    await as('merchant', () => tool(getMerchantTools(), 'payware_shops_set_delivery').handler({ shopCode: 'SHOP01', countries: [] }));
    assert.deepEqual(payware.sandbox.lastRequest.json, { countries: [] });
  });

  test('an ISV acts on behalf of the merchant: aud is the merchant, sub its token', async () => {
    payware.reset();
    for (const [name, args] of [
      ['payware_shops_get_delivery', { shopCode: 'SHOP01' }],
      ['payware_shops_set_delivery', { shopCode: 'SHOP01', countries: SHOP_TABLE }],
      ['payware_products_get_delivery', { productId: PRODUCT }],
      ['payware_products_set_delivery', { productId: PRODUCT, countries: PRODUCT_ROWS }]
    ]) {
      payware.reset();
      const result = await as('isv', () => tool(getISVTools(), name).handler({ ...ISV, ...args }));
      const req = payware.sandbox.lastRequest;
      assert.equal(req.jwt.signatureValid, true, name);
      assert.deepEqual({ aud: req.jwt.payload.aud, sub: req.jwt.payload.sub }, { aud: 'PZAYNMVE', sub: OAUTH2_TOKEN }, name);
      assert.notEqual(result.isError, true, name);
    }
  });

  test('product overrides: the body carries the rows as given, and a mixed row is refused before sending', async () => {
    payware.reset();
    await as('merchant', () => tool(getMerchantTools(), 'payware_products_set_delivery').handler({ productId: PRODUCT, countries: PRODUCT_ROWS }));
    assert.deepEqual(payware.sandbox.lastRequest.json, { countries: PRODUCT_ROWS });

    payware.reset();
    const mixed = await as('merchant', () => tool(getMerchantTools(), 'payware_products_set_delivery').handler({ productId: PRODUCT, countries: [{ country: 'RO', excluded: true, surchargePerUnit: '1.00' }] })).catch(e => e);
    assert.match(String(mixed.message ?? text(mixed)), /excluded country takes no surchargePerUnit/);
    const bare = await as('merchant', () => tool(getMerchantTools(), 'payware_products_set_delivery').handler({ productId: PRODUCT, countries: [{ country: 'RO', excluded: false }] })).catch(e => e);
    assert.match(String(bare.message ?? text(bare)), /needs surchargePerUnit/);
    assert.equal(payware.requests().length, 0, 'nothing may be sent for a row the server would refuse');
  });

  test("the server's refusal of a table reads as an error with its code", async () => {
    payware.reset();
    const result = await as('merchant', () => tool(getMerchantTools(), 'payware_shops_set_delivery').handler({
      shopCode: 'SHOP01', countries: [{ country: 'Bulgaria', currency: 'EUR', fee: '5.00' }]
    }));
    assert.equal(result.isError, true);
    assert.match(text(result), /ERR_INVALID_DELIVERY_COUNTRY/);
  });

  test('a saved table that leaves shippable products deliverable nowhere says so, from undeliverableProducts', async () => {
    payware.reset();
    const stranded = await as('merchant', () => tool(getMerchantTools(), 'payware_shops_set_delivery').handler({
      shopCode: 'SHOP01', countries: [{ country: 'US', currency: 'USD', fee: '9.00' }]
    }));
    assert.notEqual(stranded.isError, true, text(stranded));
    assert.deepEqual(payware.sandbox.lastRequest.response.body.undeliverableProducts, [{ productId: 'prVase0001', name: 'Vase', currency: 'EUR' }]);
    assert.match(text(stranded), /1 product can now be delivered nowhere/);
    assert.match(text(stranded), /Vase \(prVase0001, EUR\)/);
    assert.match(text(stranded), /The table was saved/);

    for (const countries of [SHOP_TABLE, []]) {
      payware.reset();
      const fine = await as('merchant', () => tool(getMerchantTools(), 'payware_shops_set_delivery').handler({ shopCode: 'SHOP01', countries }));
      assert.ok(!('undeliverableProducts' in payware.sandbox.lastRequest.response.body), 'absent when none, and for an empty table');
      assert.doesNotMatch(text(fine), /delivered nowhere/);
    }
    assert.match(tool(getMerchantTools(), 'payware_shops_set_delivery').description, /undeliverableProducts/);
  });

  test('setting a table is destructive (it replaces), reading is not; none takes a key as an argument', () => {
    for (const role of [getMerchantTools(), getISVTools()]) {
      for (const name of ['payware_shops_set_delivery', 'payware_products_set_delivery']) {
        assert.equal(tool(role, name).annotations.destructiveHint, true, name);
      }
      for (const name of ['payware_shops_get_delivery', 'payware_products_get_delivery']) {
        assert.equal(tool(role, name).annotations.readOnlyHint, true, name);
      }
    }
    for (const name of ['payware_shops_get_delivery', 'payware_shops_set_delivery', 'payware_products_get_delivery', 'payware_products_set_delivery']) {
      const params = Object.keys(tool(getMerchantTools(), name).inputSchema.properties);
      assert.ok(!params.includes('privateKey') && !params.includes('partnerId'), name);
    }
  });
});

describe('items on a merchant-created payment', () => {
  const ITEMS = [
    { type: 'ITEM', name: 'Vase', quantity: 2, unitPrice: '40.00', amount: '80.00' },
    { type: 'SHIPPING', name: 'Delivery', amount: '5.00' },
    { type: 'DISCOUNT', name: 'Voucher', amount: '-10.00' }
  ];

  for (const [role, registry, extra] of [
    ['merchant', getMerchantTools, {}],
    ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN }]
  ]) {
    test(`${role}: items go on the root of the body as given, and the lines sum to the amount`, async () => {
      payware.reset();
      const result = await as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({
        ...extra, amount: 75, currency: 'EUR', reasonL1: 'Order 17', items: ITEMS
      }));
      const req = payware.sandbox.lastRequest;
      assert.equal(`${req.method} ${req.path}`, 'POST /api/transactions');
      assert.equal(req.contentHashMatches, true);
      assert.deepEqual(req.json.items, [
        { type: 'ITEM', name: 'Vase', amount: '80.00', quantity: 2, unitPrice: '40.00' },
        { type: 'SHIPPING', name: 'Delivery', amount: '5.00' },
        { type: 'DISCOUNT', name: 'Voucher', amount: '-10.00' }
      ]);
      assert.equal(req.json.trData.amount, '75');
      assert.notEqual(result.isError, true, text(result));
    });

    test(`${role}: no items, no items key`, async () => {
      payware.reset();
      await as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({ ...extra, amount: 10, currency: 'EUR', reasonL1: 'Plain' }));
      assert.ok(!('items' in payware.sandbox.lastRequest.json));
    });

    test(`${role}: lines that do not sum are refused by payware with ERR_ITEMS_DO_NOT_SUM, as an error`, async () => {
      payware.reset();
      const result = await as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({
        ...extra, amount: 99, currency: 'EUR', reasonL1: 'Order 17', items: ITEMS
      }));
      assert.match(JSON.stringify(payware.sandbox.lastRequest.response.body), /ERR_ITEMS_DO_NOT_SUM/);
      assert.match(text(result), /ERR_ITEMS_DO_NOT_SUM|Transaction Creation Failed/);
      assert.equal(result.isError, true);
    });

    test(`${role}: a malformed line, or items without an amount, is refused before anything is sent`, async () => {
      payware.reset();
      const create = args => as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({ ...extra, currency: 'EUR', reasonL1: 'x', ...args }));
      assert.equal((await create({ amount: 10, items: [{ type: 'ITEM', name: 'No quantity', amount: '10.00' }] })).isError, true);
      assert.equal((await create({ amount: 10, items: [{ type: 'GIFT', name: 'Odd', amount: '10.00' }] })).isError, true);
      assert.equal((await create({ items: [{ type: 'SHIPPING', name: 'Delivery', amount: '5.00' }] })).isError, true);
      assert.equal((await create({ amount: 10, items: [] })).isError, true);
      assert.equal(payware.requests().length, 0);
    });

    test(`${role}: a merchant line carries no country, and an empty list names ERR_ITEMS_EMPTY, before anything is sent`, async () => {
      payware.reset();
      const create = args => as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({ ...extra, currency: 'EUR', reasonL1: 'x', amount: 5, ...args }));
      for (const type of ['SHIPPING', 'ITEM']) {
        const line = type === 'ITEM' ? { type, name: 'Vase', quantity: 1, unitPrice: '5.00', amount: '5.00', country: 'BG' } : { type, name: 'Delivery', amount: '5.00', country: 'BG' };
        const withCountry = await create({ items: [line] });
        assert.equal(withCountry.isError, true, type);
        assert.match(text(withCountry), /carries no country/, type);
      }
      const empty = await create({ items: [] });
      assert.equal(empty.isError, true);
      assert.match(text(empty), /ERR_ITEMS_EMPTY/);
      assert.equal(payware.requests().length, 0);
    });

    test(`${role}: a TIP line is refused before anything is sent: a tip is never a line (spec 24.1)`, async () => {
      payware.reset();
      const result = await as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({
        ...extra, currency: 'EUR', reasonL1: 'x', amount: 12,
        items: [{ type: 'ITEM', name: 'Coffee', quantity: 1, unitPrice: '10.00', amount: '10.00' }, { type: 'TIP', name: 'Tip', amount: '2.00' }]
      }));
      assert.equal(result.isError, true);
      assert.match(text(result), /items\[1\]: a tip is never a line/);
      assert.match(text(result), /ERR_INVALID_ITEMS/);
      assert.equal(payware.requests().length, 0);
    });

    test(`${role}: the merchant's own tip goes as trData.tip, inside amount, and the lines add up to amount minus tip (spec 24.1, D2)`, async () => {
      payware.reset();
      const create = args => as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({ ...extra, currency: 'EUR', reasonL1: 'Table 4', ...args }));
      const coffee = [{ type: 'ITEM', name: 'Coffee', quantity: 1, unitPrice: '10.00', amount: '10.00' }];
      const result = await create({ amount: 12, tip: 2, items: coffee });
      assert.notEqual(result.isError, true, text(result));
      assert.deepEqual([payware.sandbox.lastRequest.json.trData.amount, payware.sandbox.lastRequest.json.trData.tip], ['12', '2'], 'a number goes as its plain decimal');
      assert.match(text(result), /tip included: 2 EUR/);

      payware.reset();
      await create({ amount: '12.00' });
      assert.ok(!('tip' in payware.sandbox.lastRequest.json.trData), 'no tip, no key');

      // Lines that add up to the amount with the tip in it: payware's ERR_ITEMS_DO_NOT_SUM.
      payware.reset();
      const wrongSum = await create({ amount: '12.00', tip: '2.00', items: [{ type: 'ITEM', name: 'Coffee', quantity: 1, unitPrice: '12.00', amount: '12.00' }] });
      assert.equal(wrongSum.isError, true);
      assert.match(JSON.stringify(payware.sandbox.lastRequest.response.body), /ERR_ITEMS_DO_NOT_SUM/);

      // What the server would refuse for the tip alone is refused before sending.
      payware.reset();
      for (const [args, why] of [
        [{ amount: '12.00', tip: '0' }, /plain decimal above zero/],
        [{ amount: '12.00', tip: '1e2' }, /plain decimal above zero/],
        [{ amount: '12.00', tip: '6.01' }, /at most half of amount/],
        [{ tip: '1.00' }, /at most half of amount/]
      ]) {
        const refused = await create(args);
        assert.equal(refused.isError, true, JSON.stringify(args));
        assert.match(text(refused), why, JSON.stringify(args));
      }
      assert.equal(payware.requests().length, 0);
      assert.deepEqual(tool(registry(), 'payware_operations_create_transaction').inputSchema.properties.tip, MERCHANT_TIP_PROPERTY);
    });
  }

  test('the line schema has no country and no TIP, and the descriptions name ERR_ITEMS_EMPTY, the country rule and the one tip rule', () => {
    assert.ok(!('country' in ITEMS_PROPERTY.items.properties));
    assert.equal(ITEMS_PROPERTY.items.additionalProperties, false);
    assert.deepEqual(ITEMS_PROPERTY.items.properties.type.enum, ['ITEM', 'SHIPPING', 'DISCOUNT', 'TAX', 'SURCHARGE']);
    assert.deepEqual(LINE_TYPES, ITEM_TYPES, 'a tip is never a line, so payware returns the same line types');
    for (const part of ['ERR_ITEMS_EMPTY', 'ERR_INVALID_ITEMS', 'country', 'ERR_AMOUNT_NOT_TOTAL', 'TIP', 'minus \`tip\`', 'never a line']) assert.ok(ITEMS_DESCRIPTION.includes(part), part);
    assert.match(ITEMS_PROPERTY.description, /No TIP line/);
    for (const part of ['trData.tip', 'tipsAllowed', 'ERR_INVALID_TIP', 'no paying more without a tip', 'offers no second tip']) assert.ok(MERCHANT_TIP_DESCRIPTION.includes(part), part);
    assert.deepEqual(MERCHANT_TIP_PROPERTY.type, ['string', 'number']);
  });
});

describe('payment lifetime on a merchant-created payment (spec 24.3)', () => {
  const ROLES = [
    ['merchant', getMerchantTools, {}],
    ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN }]
  ];
  const create = (role, registry, extra, args) => as(role, () => tool(registry(), 'payware_operations_create_transaction').handler({
    ...extra, amount: 10, currency: 'EUR', reasonL1: 'Order 17', ...args
  }));

  for (const [role, registry, extra] of ROLES) {
    test(`${role}: timeToLive outside 60 to 2592000 is refused before sending, naming ERR_INVALID_TTL`, async () => {
      payware.reset();
      for (const timeToLive of [59, 0, 2592001, 120.5, 'soon']) {
        const result = await create(role, registry, extra, { timeToLive });
        assert.equal(result.isError, true, String(timeToLive));
        assert.match(text(result), /60 to 2592000/, String(timeToLive));
        assert.match(text(result), /ERR_INVALID_TTL/, String(timeToLive));
      }
      assert.equal(payware.requests().length, 0, 'nothing outside the widest ceiling reaches payware');
    });

    test(`${role}: timeToLive within the range goes as trOptions.timeToLive, and 120 when left out`, async () => {
      for (const timeToLive of [60, 600]) {
        payware.reset();
        const result = await create(role, registry, extra, { timeToLive });
        assert.equal(payware.sandbox.lastRequest.json.trOptions.timeToLive, timeToLive);
        assert.notEqual(result.isError, true, text(result));
      }
      payware.reset();
      await create(role, registry, extra, {});
      assert.equal(payware.sandbox.lastRequest.json.trOptions.timeToLive, 120);
    });

    test(`${role}: the schema allows 60 to 2592000 and says the ceiling is the merchant's, 600 by default, and that plugins keep 60-600`, () => {
      const { timeToLive } = tool(registry(), 'payware_operations_create_transaction').inputSchema.properties;
      assert.deepEqual([timeToLive.minimum, timeToLive.maximum], [60, 2592000]);
      for (const part of ['600 by default', 'Longest payment lifetime', '2592000', 'ERR_INVALID_TTL', '60-600', 'cannot change it']) {
        assert.ok(timeToLive.description.includes(part), `${role} timeToLive does not say "${part}"`);
      }
      assert.match(tool(registry(), 'payware_operations_create_transaction').description, /PAYMENT LIFETIME/);
    });
  }

  test('payware enforces the merchant\'s own ceiling: 600 by default, the raised one on behalf', async () => {
    payware.reset();
    const merchant = await create('merchant', getMerchantTools, {}, { timeToLive: 3600 });
    assert.equal(merchant.isError, true, 'TESTMRCH keeps the default ceiling of 600');
    assert.match(JSON.stringify(payware.sandbox.lastRequest.response.body), /ERR_INVALID_TTL/);

    payware.reset();
    const isv = await create('isv', getISVTools, { merchantPartnerId: 'PZAYNMVE', oauth2Token: OAUTH2_TOKEN }, { timeToLive: 2592000 });
    assert.notEqual(isv.isError, true, text(isv));
    assert.equal(payware.sandbox.lastRequest.json.trOptions.timeToLive, 2592000, 'PZAYNMVE raised its ceiling to 30 days, and the ISV gets it');
  });
});

describe('simulate callback: product, placement, session and items', () => {
  const LINES = [
    { type: 'ITEM', productId: PRODUCT, name: 'Vase', quantity: 2, unitPrice: '40.00', amount: '80.00' },
    { type: 'SHIPPING', name: 'Delivery', country: 'BG', amount: '5.00' }
  ];
  const payloadOf = result => JSON.parse(text(result).match(/```json\n([\s\S]*?)\n```/)[1]);

  for (const [role, registry, extra] of [['merchant', getMerchantTools, {}], ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE' }]]) {
    test(`${role}: the ids and the lines are on the payload, with the total worked out, and no images`, async () => {
      const result = await tool(registry(), 'payware_operations_simulate_callback').handler({
        ...extra, transactionId: 'pw12345678', amount: '84.00', fee: '1.00',
        productId: PRODUCT, placementId: 'pl12345678', sessionId: 'pa12345678',
        items: [{ ...LINES[0], imageUrl: 'https://x/y.png' }, LINES[1]]
      });
      const payload = payloadOf(result);
      assert.equal(payload.productId, PRODUCT);
      assert.equal(payload.placementId, 'pl12345678');
      assert.equal(payload.sessionId, 'pa12345678');
      assert.deepEqual(payload.items, LINES);
      assert.equal(payload.total, '85.00');
      assert.equal(payload.amount, '84.00', 'amount stays net of the fee, total is the sum of the lines');
    });

    test(`${role}: without them the payload has none of the keys: absent means absent`, async () => {
      const payload = payloadOf(await tool(registry(), 'payware_operations_simulate_callback').handler({ ...extra, transactionId: 'pw12345678' }));
      for (const key of ['productId', 'placementId', 'sessionId', 'items', 'total']) assert.ok(!(key in payload), key);
    });
  }

  for (const [role, registry, extra] of [['merchant', getMerchantTools, {}], ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE' }]]) {
    test(`${role}: with items and no amount the money follows the lines: CONFIRMED amount = total - fee, other statuses amount = total`, async () => {
      const simulate = args => tool(registry(), 'payware_operations_simulate_callback').handler({ ...extra, transactionId: 'pw12345678', items: LINES, ...args });
      const confirmed = payloadOf(await simulate({ fee: '1.29' }));
      assert.deepEqual([confirmed.total, confirmed.amount, confirmed.fee], ['85.00', '83.71', '1.29']);
      const declined = payloadOf(await simulate({ status: 'DECLINED', fee: '1.29' }));
      assert.deepEqual([declined.total, declined.amount], ['85.00', '85.00'], 'nothing was paid: amount is the requested total');
      const noFee = payloadOf(await simulate({}));
      assert.deepEqual([noFee.total, noFee.amount], ['85.00', '85.00']);
      const unknownFee = payloadOf(await simulate({ fee: null }));
      assert.ok(!('fee' in unknownFee));
      assert.equal(unknownFee.amount, '85.00');
    });

    test(`${role}: an amount the server would never send with those lines is refused, and says what it would be`, async () => {
      const simulate = args => tool(registry(), 'payware_operations_simulate_callback').handler({ ...extra, transactionId: 'pw12345678', items: LINES, ...args });
      const confirmed = await simulate({ amount: '57.60', fee: '1.00' });
      assert.equal(confirmed.isError, true);
      assert.match(text(confirmed), /net of the fee[\s\S]*84\.00/);
      const declined = await simulate({ status: 'FAILED', amount: '84.00', fee: '1.00' });
      assert.equal(declined.isError, true);
      assert.match(text(declined), /lines' total 85\.00/);
      assert.notEqual((await simulate({ amount: '84', fee: '1.00' })).isError, true, '84 and 84.00 are the same amount');
    });
  }

  test('both tools declare the new parameters, and amount has no default that would contradict the lines', () => {
    for (const registry of [getMerchantTools, getISVTools]) {
      const { properties } = tool(registry(), 'payware_operations_simulate_callback').inputSchema;
      for (const key of ['productId', 'placementId', 'sessionId', 'items']) assert.ok(key in properties, key);
      assert.equal(properties.amount.default, undefined);
    }
  });

  for (const [role, registry, extra] of [['merchant', getMerchantTools, {}], ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE' }]]) {
    test(`${role}: a tip is carried as tip, never a line; total stays what was sold and amount + fee = total + tip (spec 24.1)`, async () => {
      const simulate = args => tool(registry(), 'payware_operations_simulate_callback').handler({ ...extra, transactionId: 'pw12345678', items: LINES, ...args });
      const payload = payloadOf(await simulate({ tip: '2.00', fee: '1.29' }));
      assert.equal(payload.tip, '2.00');
      assert.ok(payload.items.every(line => line.type !== 'TIP'));
      assert.deepEqual([payload.total, payload.amount], ['85.00', '85.71'], 'total is what was sold; amount is total + tip net of the fee');
      const declined = payloadOf(await simulate({ tip: '2.00', status: 'DECLINED' }));
      assert.equal(declined.amount, '87.00', 'nothing was paid: amount is total + tip');
      assert.ok(!('tip' in payloadOf(await simulate({}))), 'no tip, no key');
      const wrong = await simulate({ tip: '2.00', fee: '1.29', amount: '83.71' });
      assert.equal(wrong.isError, true);
      assert.match(text(wrong), /tip 2\.00/);
      assert.equal((await simulate({ tip: 'abc' })).isError, true);
      assert.match(tool(registry(), 'payware_operations_simulate_callback').description, /A tip is never a line/i);
      assert.deepEqual(tool(registry(), 'payware_operations_simulate_callback').inputSchema.properties.tip, CALLBACK_TIP_PROPERTY);
    });
  }

  for (const [role, registry, extra] of [['merchant', getMerchantTools, {}], ['isv', getISVTools, { merchantPartnerId: 'PZAYNMVE' }]]) {
    test(`${role}: tipEnteredBy comes with the tip, PAYER unless MERCHANT is given, and never without a tip (review D15)`, async () => {
      const simulate = args => tool(registry(), 'payware_operations_simulate_callback').handler({ ...extra, transactionId: 'pw12345678', ...args });
      assert.equal(payloadOf(await simulate({ amount: '22.00', tip: '2.00' })).tipEnteredBy, 'PAYER');
      assert.equal(payloadOf(await simulate({ amount: '22.00', tip: '2.00', tipEnteredBy: 'MERCHANT' })).tipEnteredBy, 'MERCHANT');
      assert.ok(!('tipEnteredBy' in payloadOf(await simulate({ amount: '22.00', tipEnteredBy: 'MERCHANT' }))), 'no tip, no tipEnteredBy');
      assert.deepEqual(tool(registry(), 'payware_operations_simulate_callback').inputSchema.properties.tipEnteredBy.enum, ['MERCHANT', 'PAYER']);
    });
  }

  test('the callback line schema has no TIP: a tip is never a line', () => {
    assert.deepEqual(CALLBACK_ITEMS_PROPERTY.items.properties.type.enum, LINE_TYPES);
    assert.ok(!LINE_TYPES.includes('TIP'));
    assert.match(CALLBACK_ITEMS_PROPERTY.description, /A tip is never a line: give it as tip/);
    assert.match(CALLBACK_TIP_PROPERTY.description, /amount \+ fee = total \+ tip/);
  });

  test('without items the amount is still 57.60 by default', async () => {
    const payload = payloadOf(await tool(getMerchantTools(), 'payware_operations_simulate_callback').handler({ transactionId: 'pw12345678' }));
    assert.equal(payload.amount, '57.60');
  });
});

describe('institution tools', () => {
  const fi = name => tool(getPaymentInstitutionTools(), name);

  test('reading an offer sends deliveryCountry and quantity as query parameters, and only when given', async () => {
    payware.reset();
    await as('payment_institution', () => fi('payware_operations_get_transaction_status').handler({ transactionId: PRODUCT, deliveryCountry: 'BG', quantity: 3 }));
    assert.deepEqual(payware.sandbox.lastRequest.query, { deliveryCountry: 'BG', quantity: '3' });

    payware.reset();
    await as('payment_institution', () => fi('payware_operations_get_transaction_status').handler({ transactionId: PRODUCT }));
    assert.deepEqual(payware.sandbox.lastRequest.query, {});
  });

  test('a session id (pa) can be read, and a bad country or quantity comes back as the server refusal', async () => {
    payware.reset();
    const pattern = new RegExp(fi('payware_operations_get_transaction_status').inputSchema.properties.transactionId.pattern);
    assert.ok(pattern.test('pa12345678'));
    const read = await as('payment_institution', () => fi('payware_operations_get_transaction_status').handler({ transactionId: 'pa12345678' }));
    assert.equal(payware.sandbox.lastRequest.path, '/api/transactions/pa12345678');
    assert.notEqual(read.isError, true);

    payware.reset();
    const bad = await as('payment_institution', () => fi('payware_operations_get_transaction_status').handler({ transactionId: PRODUCT, quantity: 0 }));
    assert.match(JSON.stringify(payware.sandbox.lastRequest.response.body), /ERR_INVALID_QUANTITY/);
    assert.equal(bad.isError, true);
  });

  test('quote: GET /transactions/{id}/quote with the same parameters, signed as an institution, with no body', async () => {
    payware.reset();
    const result = await as('payment_institution', () => fi('payware_fi_quote').handler({ transactionId: PRODUCT, deliveryCountry: 'ro', quantity: 2 }));
    const req = payware.sandbox.lastRequest;
    assert.equal(`${req.method} ${req.path}`, `GET /api/transactions/${PRODUCT}/quote`);
    assert.deepEqual(req.query, { deliveryCountry: 'ro', quantity: '2' });
    assert.equal(req.rawBody, '');
    assert.equal(req.jwt.signatureValid, true);
    assert.notEqual(result.isError, true);
    assert.match(text(result), /Total: 80.00 EUR/);
    assert.equal(fi('payware_fi_quote').annotations.readOnlyHint, true);
    assert.equal(req.response.body.countryServed, true);

    // As the server: no country given, no deliveryCountry or countryServed; a pa quote carries no quantity.
    payware.reset();
    await as('payment_institution', () => fi('payware_fi_quote').handler({ transactionId: PRODUCT }));
    const plain = payware.sandbox.lastRequest.response.body;
    assert.ok(!('countryServed' in plain) && !('deliveryCountry' in plain));
    assert.equal(plain.quantity, 1);
    payware.reset();
    await as('payment_institution', () => fi('payware_fi_quote').handler({ transactionId: 'pa12345678', deliveryCountry: 'BG' }));
    assert.ok(!('quantity' in payware.sandbox.lastRequest.response.body));
  });

  test('quote is for institutions: no other role has it, and a pw or pi id does not match its schema', () => {
    for (const registry of [getMerchantTools, getISVTools, getPayerTools]) assert.equal(tool(registry(), 'payware_fi_quote'), undefined);
    const pattern = new RegExp(fi('payware_fi_quote').inputSchema.properties.transactionId.pattern);
    for (const ok of ['pr12345678', 'pl12345678', 'ps12345678', 'pa12345678']) assert.ok(pattern.test(ok), ok);
    for (const no of ['pw12345678', 'pi12345678']) assert.ok(!pattern.test(no), no);
  });

  test('a quote the server refuses reads as an error', async () => {
    payware.reset();
    const result = await as('payment_institution', () => fi('payware_fi_quote').handler({ transactionId: PRODUCT, quantity: 100 }));
    assert.equal(result.isError, true);
    assert.match(text(result), /ERR_INVALID_QUANTITY/);
  });

  test('processing sends quantity as trData.quantity, and omits it when not given', async () => {
    payware.reset();
    const base = { transactionId: PRODUCT, friendlyName: 'Jane Doe', currency: 'EUR', amount: '85.00' };
    await as('payment_institution', () => fi('payware_operations_process_transaction').handler({
      ...base, quantity: 2, deliveryAddress: { fullName: 'Jane Doe', streetAddressLine1: '1 Main St', zipCode: '1000', city: 'Sofia', country: 'BG', email: 'jane@example.com' }
    }));
    const req = payware.sandbox.lastRequest;
    assert.equal(req.json.trData.quantity, 2);
    assert.equal(req.json.deliveryAddress.country, 'BG');
    assert.equal(req.contentHashMatches, true);

    payware.reset();
    await as('payment_institution', () => fi('payware_operations_process_transaction').handler(base));
    assert.ok(!('quantity' in payware.sandbox.lastRequest.json.trData));
  });

  test('the delivery country text names the ISO alpha-2 code, and a session can be processed', () => {
    const process = fi('payware_operations_process_transaction');
    assert.match(process.inputSchema.properties.deliveryAddress.properties.country.description, /ISO 3166-1 alpha-2 code, e\.g\. BG/);
    assert.ok(new RegExp(process.inputSchema.properties.transactionId.pattern).test('pa12345678'));
    assert.deepEqual([process.inputSchema.properties.quantity.minimum, process.inputSchema.properties.quantity.maximum], [1, 99]);
  });

  test('the descriptions document pa ids, items, total, delivery and the quote', () => {
    const status = fi('payware_operations_get_transaction_status').description;
    for (const word of ['pa', 'items', 'total', 'delivery', 'countryServed', 'deliveryCountry', 'payware_fi_quote', 'ERR_SESSION_NOT_FOUND']) {
      assert.ok(status.includes(word), `get status does not mention ${word}`);
    }
    assert.match(fi('payware_operations_process_transaction').description, /ERR_AMOUNT_NOT_TOTAL/);
    assert.match(fi('payware_fi_quote').description, /ERR_DELIVERY_COUNTRY_NOT_SERVED/);
  });

  test('the descriptions follow the 2026-11-15 contract: deliveryDetails, the session country, surcharges, the agent address', () => {
    const status = fi('payware_operations_get_transaction_status').description;
    assert.match(status, /deliveryDetails: true/);
    assert.match(status, /only when this is true/);
    assert.match(status, /priced for that address's country/);
    assert.match(status, /only authenticated institutions ever read it/);
    assert.match(status, /an agent's address never does/);
    const process = fi('payware_operations_process_transaction');
    assert.match(process.description, /has a delivery surcharge/);
    assert.match(process.description, /deliveryDetails: true/);
    assert.match(process.description, /An agent's own address never stands in/);
    assert.match(process.inputSchema.properties.amount.description, /exactly the amount the payment asks \(its total when it has lines, else its amount\), or that \+ tip when you send tip/);
    assert.match(process.inputSchema.properties.amount.description, /15 integer digits/);
    assert.match(fi('payware_fi_quote').description, /prices the country you give/);
    for (const registry of [getMerchantTools, getISVTools]) {
      const update = tool(registry(), 'payware_products_update_product').description;
      assert.match(update, /ERR_PRODUCT_CURRENCY_HAS_SURCHARGES/);
      assert.match(update, /ERR_NO_DELIVERY_IN_CURRENCY/);
      assert.match(tool(registry(), 'payware_operations_create_transaction').inputSchema.properties.amount.description, /15 integer digits/);
    }
  });
});

describe('institution tools: tip and re-pricing (spec 24.1, 24.2)', () => {
  const fi = name => tool(getPaymentInstitutionTools(), name);
  const BASE = { friendlyName: 'Jane Doe', currency: 'EUR', reasonL1: 'Test Merchant - Main store' };
  const process = args => as('payment_institution', () => fi('payware_operations_process_transaction').handler({ ...BASE, ...args }));

  test('a tip goes as trData.tip, as given, beside amount = total + tip', async () => {
    payware.reset();
    const result = await process({ transactionId: 'pa12345678', amount: '87.00', tip: '2.00' });
    const req = payware.sandbox.lastRequest;
    assert.equal(`${req.method} ${req.path}`, 'POST /api/transactions/pa12345678');
    assert.deepEqual([req.json.trData.amount, req.json.trData.tip], ['87.00', '2.00']);
    assert.equal(req.contentHashMatches, true);
    assert.notEqual(result.isError, true, text(result));
    assert.match(text(result), /Tip: 2\.00 EUR/);

    payware.reset();
    await process({ transactionId: PRODUCT, quantity: 2, amount: 82, tip: 2 });
    assert.deepEqual([payware.sandbox.lastRequest.json.trData.quantity, payware.sandbox.lastRequest.json.trData.tip], [2, '2'], 'a number goes as its plain decimal');

    // One tip rule (spec 24.1): a product without quantity and a POI sale take a tip too.
    for (const transactionId of [PRODUCT, IDS.POI]) {
      payware.reset();
      const result = await process({ transactionId, amount: '42.00', tip: '2.00' });
      assert.notEqual(result.isError, true, `${transactionId}: ${text(result)}`);
      assert.equal(payware.sandbox.lastRequest.json.trData.tip, '2.00');
    }

    payware.reset();
    await process({ transactionId: 'pa12345678', amount: '85.00' });
    assert.ok(!('tip' in payware.sandbox.lastRequest.json.trData), 'no tip, no key');
  });

  test('what the server would refuse for the tip alone is refused before sending', async () => {
    payware.reset();
    for (const [args, why] of [
      [{ transactionId: 'pa12345678', amount: '85.00', tip: '0' }, /plain decimal above zero/],
      [{ transactionId: 'pa12345678', amount: '85.00', tip: '-1.00' }, /plain decimal above zero/],
      [{ transactionId: 'pa12345678', amount: '85.00', tip: '1e2' }, /plain decimal above zero/],
      [{ transactionId: 'pa12345678', amount: '2.00', tip: '2.00' }, /at most half of amount/],
      [{ transactionId: 'pa12345678', amount: '3.99', tip: '2.00' }, /at most half of amount/]
    ]) {
      const result = await process(args);
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(text(result), why, JSON.stringify(args));
    }
    assert.equal(payware.requests().length, 0);
  });

  test('a tip where the shop takes none, or on the merchant\'s own tip, comes back as payware\'s 409 ERR_TIPS_NOT_ALLOWED', async () => {
    payware.reset();
    const result = await process({ transactionId: IDS.TX, amount: '12.00', tip: '2.00' });
    assert.equal(result.isError, true);
    assert.match(text(result), /ERR_TIPS_NOT_ALLOWED/);
    const onTipped = await process({ transactionId: IDS.TIPPED, amount: '24.00', tip: '2.00' });
    assert.equal(onTipped.isError, true);
    assert.match(text(onTipped), /ERR_TIPS_NOT_ALLOWED/);
    // The merchant's tip is inside the amount: the payer's bank pays exactly it.
    assert.notEqual((await process({ transactionId: IDS.TIPPED, amount: '22.00' })).isError, true);
  });

  test('paying more without a tip is gone: payware answers 409 ERR_AMOUNT_NOT_TOTAL, less is 400 ERR_INVALID_AMOUNT', async () => {
    payware.reset();
    const more = await process({ transactionId: IDS.TX, amount: '12.00' });
    assert.equal(more.isError, true);
    assert.match(text(more), /ERR_AMOUNT_NOT_TOTAL/);
    const less = await process({ transactionId: IDS.TX, amount: '9.99' });
    assert.equal(less.isError, true);
    assert.match(text(less), /ERR_INVALID_AMOUNT/);
    assert.notEqual((await process({ transactionId: IDS.TX, amount: '10.00' })).isError, true);
  });

  test('EXECUTING carries exactly the processed amount (review S1): another one is 400 ERR_SPECIFYING_AMOUNT_NOT_ALLOWED', async () => {
    payware.reset();
    const finalize = args => as('payment_institution', () => fi('payware_operations_finalize_transaction').handler({ transactionId: IDS.TX, status: 'EXECUTING', fee: '0.10', currency: 'EUR', transferType: 'INSTANT', ...args }));
    const higher = await finalize({ amount: '12.00' });
    assert.equal(higher.isError, true);
    assert.match(text(higher), /ERR_SPECIFYING_AMOUNT_NOT_ALLOWED/);
    assert.notEqual((await finalize({ amount: '10.00' })).isError, true);
    payware.reset();
    const description = fi('payware_operations_finalize_transaction').description;
    assert.match(description, /exactly the amount you processed, tip included/);
    assert.match(description, /ERR_SPECIFYING_AMOUNT_NOT_ALLOWED/);
  });

  test('the process tool says how to tip, when it is refused, and what payware writes', () => {
    const { description, inputSchema } = fi('payware_operations_process_transaction');
    for (const part of ['trData.tip', 'tipsAllowed: true', 'the amount asked + tip', 'ERR_INVALID_TIP', 'ERR_TIPS_NOT_ALLOWED', 'ERR_AMOUNT_NOT_TOTAL', 'never as a line', 'tip included', 'same tip', 'no paying more without a tip']) {
      assert.ok(description.includes(part), `process does not say "${part}"`);
    }
    assert.ok(!description.includes('"type":"TIP"'), 'no TIP line any more');
    assert.deepEqual(inputSchema.properties.tip.type, ['string', 'number']);
    for (const part of ['ERR_INVALID_TIP', 'ERR_TIPS_NOT_ALLOWED', 'the amount asked + tip', 'with or without lines']) assert.ok(inputSchema.properties.tip.description.includes(part), part);
  });

  test('a session in another country is re-priced, never refused for its price: ERR_SESSION_DELIVERY_FEE_DIFFERS is gone from every tool', () => {
    const process = fi('payware_operations_process_transaction');
    assert.match(process.description, /re-priced, never refused for its price/);
    assert.match(process.inputSchema.properties.deliveryAddress.description, /re-priced for that country, never refused/);
    assert.match(fi('payware_operations_get_transaction_status').description, /re-priced, never refused for its price/);
    assert.match(fi('payware_fi_quote').description, /re-priced for your payer's country/);
    for (const registry of [getMerchantTools, getISVTools, getPaymentInstitutionTools, getPayerTools]) {
      for (const t of registry()) {
        assert.ok(!JSON.stringify({ d: t.description, s: t.inputSchema }).includes('ERR_SESSION_DELIVERY_FEE_DIFFERS'), t.name);
      }
    }
  });

  test('a session paid with the page\'s address sends deliveryAddressVersion at the root, and only when given (review C4)', async () => {
    payware.reset();
    const result = await process({ transactionId: 'pa12345678', amount: '85.00', deliveryAddressVersion: '3f9a1c7e0b2d4a65' });
    const req = payware.sandbox.lastRequest;
    assert.equal(req.json.deliveryAddressVersion, '3f9a1c7e0b2d4a65');
    assert.ok(!('deliveryAddressVersion' in req.json.trData));
    assert.equal(req.contentHashMatches, true);
    assert.notEqual(result.isError, true, text(result));
    payware.reset();
    await process({ transactionId: 'pa12345678', amount: '85.00' });
    assert.ok(!('deliveryAddressVersion' in payware.sandbox.lastRequest.json), 'no version, no key');

    const tool_ = fi('payware_operations_process_transaction');
    assert.match(tool_.description, /ERR_SESSION_ADDRESS_CHANGED/);
    assert.match(tool_.inputSchema.properties.deliveryAddressVersion.description, /delivery\.addressVersion/);
    assert.match(fi('payware_operations_get_transaction_status').description, /delivery\.addressVersion/);
  });

  test('a 0.00 product lists its countries without amounts, on the read and the quote', () => {
    assert.match(fi('payware_operations_get_transaction_status').description, /countries served \*\*without amounts\*\*/);
    assert.match(fi('payware_fi_quote').description, /countries served \*\*without amounts\*\*/);
  });

  test('a bank without an address screen may send the payer to the page for a shippable pa; a merchant\'s pw never asks for an address', () => {
    const status = fi('payware_operations_get_transaction_status').description;
    assert.match(status, /\?delivery\` for a shippable session without a confirmed address/);
    const process = fi('payware_operations_process_transaction');
    assert.match(process.inputSchema.properties.deliveryAddress.description, /a shippable product, or a session with a shippable line/);
    // #441 (trOptions.collectDeliveryAddress) was removed before release on 2026-11-17: no tool offers or mentions it.
    for (const registry of [getMerchantTools, getISVTools, getPaymentInstitutionTools, getPayerTools]) {
      for (const t of registry()) {
        assert.ok(!JSON.stringify({ d: t.description, s: t.inputSchema }).includes('collectDeliveryAddress'), t.name);
      }
    }
  });

  test('the reads name tipsAllowed and the tip field, with no TIP line, and the quote says the tip comes on top of its total', () => {
    const status = fi('payware_operations_get_transaction_status').description;
    for (const part of ['tipsAllowed: true', 'TAX or SURCHARGE', '\`tip\` (absent otherwise)', 'merchant\'s own', 'offer no second tip', 'with or without lines']) assert.ok(status.includes(part), part);
    assert.ok(!status.includes('"type":"TIP"'));
    assert.match(fi('payware_fi_quote').description, /plus the payer's tip/);
  });
});

// --- The payer ----------------------------------------------------------------------------------------

describe('the payer role', () => {
  /** A link host: scripted answers per path, every request recorded. */
  let host;
  let hostUrl;
  const seen = [];
  const answers = new Map();

  before(async () => {
    host = createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        seen.push({ method: req.method, path: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
        const queue = answers.get(`${req.method} ${req.url}`);
        const answer = queue?.length > 1 ? queue.shift() : queue?.[0] ?? { status: 404, body: { errorCode: 'ERR_NOT_FOUND', message: 'No such link' } };
        res.writeHead(answer.status, { 'Content-Type': 'application/json', ...(answer.headers ?? {}) });
        res.end(JSON.stringify(answer.body));
      });
    });
    await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
    hostUrl = `http://127.0.0.1:${host.address().port}`;
  });
  after(async () => {
    await new Promise(resolve => host.close(resolve));
  });

  const reset = () => { seen.length = 0; answers.clear(); };
  const script = (key, ...replies) => answers.set(key, replies);
  const payer = (name, args) => withEnv({ PAYWARE_PARTNER_TYPE: 'payer', PAYWARE_LINKS_BASE_URL: hostUrl }, () => tool(getPayerTools(), name).handler(args));

  // As the server's LinkLookupResponse: a product carries amount and productName, never lines; a session's lines
  // carry no country (LinkLookupService.forPage) and its address shows as deliveryTo only. Review finding C-T1.
  const PAYEE = { name: 'Test Merchant Ltd', tradingName: 'Main store', verified: true };
  const PRODUCT_LINK = {
    id: 'pr12345678', kind: 'PRODUCT', environment: 'SANDBOX', status: 'AVAILABLE', payee: PAYEE,
    amount: '40.00', currency: 'EUR', productName: 'Vase', description: 'A blue vase',
    pay: [{ method: 'APP', url: 'payware:pr12345678' }], link: 'https://go-sandbox.payware.eu/pr12345678', deliveryDetails: true
  };
  const SESSION = {
    id: 'pa87654321', kind: 'SESSION', environment: 'SANDBOX', status: 'AVAILABLE', payee: PAYEE,
    amount: '85.00', currency: 'EUR', productName: 'Vase', expiresAt: '2026-11-15T10:00:00Z', secondsLeft: 86400,
    pay: [{ method: 'APP', url: 'payware:pa87654321' }], link: 'https://go.payware.eu/pa87654321',
    items: [{ type: 'ITEM', productId: 'pr12345678', name: 'Vase', quantity: 2, unitPrice: '40.00', amount: '80.00' }, { type: 'SHIPPING', name: 'Delivery', amount: '5.00' }],
    total: '85.00',
    deliveryTo: { city: 'Sofia', zipCode: '1000', country: 'BG', confirmed: false }
  };

  test('the role has exactly four tools, all without keys, and no tool takes a credential', () => {
    const tools = getPayerTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['payware_payer_check_price', 'payware_payer_create_session', 'payware_payer_read_link', 'payware_payer_watch']);
    for (const t of tools) {
      const params = Object.keys(t.inputSchema.properties);
      for (const forbidden of ['partnerId', 'privateKey', 'oauth2Token', 'merchantPartnerId']) assert.ok(!params.includes(forbidden), `${t.name}: ${forbidden}`);
    }
  });

  test('read_link: an id or a full link both read GET /links/{id}, with no authorization header', async () => {
    reset();
    script('GET /links/pr12345678', { status: 200, body: PRODUCT_LINK });
    for (const link of ['pr12345678', 'https://go.payware.eu/pr12345678', 'https://paywa.re/pr12345678', 'https://go-sandbox.payware.eu/pr12345678/', 'http://localhost:8080/pr12345678?x=1', `${hostUrl}/links/pr12345678`]) {
      seen.length = 0;
      const result = await payer('payware_payer_read_link', { link });
      assert.notEqual(result.isError, true, link);
      assert.deepEqual(seen.map(r => `${r.method} ${r.path}`), ['GET /links/pr12345678'], link);
      assert.equal(seen[0].headers.authorization, undefined, 'the link host is public: nothing is signed');
      assert.match(text(result), /Vase/);
    }
  });

  test('read_link: a link on another host is refused before any request, and says why', async () => {
    reset();
    for (const link of ['https://go.payware.eu.evil.example/pr12345678', 'https://pay-ware.eu/pr12345678', 'https://example.com/pr12345678', 'ftp://go.payware.eu/pr12345678']) {
      const result = await payer('payware_payer_read_link', { link }).catch(e => ({ isError: true, content: [{ text: e.message }] }));
      assert.equal(result.isError, true, link);
      assert.match(text(result), /not a payware link host|not a payware link/, link);
    }
    assert.equal(seen.length, 0, 'a foreign host must never be contacted');
  });

  test('read_link: a bad id is refused, and an unknown one comes back as an error with the status', async () => {
    reset();
    const none = await payer('payware_payer_read_link', { link: 'hello' }).catch(e => ({ isError: true, content: [{ text: e.message }] }));
    assert.equal(none.isError, true);
    assert.equal(seen.length, 0);
    const missing = await payer('payware_payer_read_link', { link: 'pr00000000' });
    assert.equal(missing.isError, true);
    assert.match(text(missing), /404/);
  });

  test('read_link describes what the lookup returns, and not fields it never sends', () => {
    const { description } = tool(getPayerTools(), 'payware_payer_read_link');
    for (const field of ['deliveryDetails', 'deliveryTo', 'lastPayment', 'amountSetByPayer', 'productName', 'secondsLeft', 'environment', 'NOT_PAID', 'CANCELLED', 'NO_PAYMENT_WAITING', 'UNKNOWN', 'payware_payer_check_price']) {
      assert.ok(description.includes(field), `read_link does not mention ${field}`);
    }
    assert.ok(!description.includes('`product` presentation'), 'the lookup has no product block');
    assert.ok(!/what delivery costs per country/.test(description), 'per-country delivery comes from the price check');
    assert.match(description, /never the name, street, phone or email/);
  });

  test('read_link: a session shows its delivery line with the deliveryTo country, as lines carry none', async () => {
    reset();
    script('GET /links/pa87654321', { status: 200, body: SESSION });
    const out = text(await payer('payware_payer_read_link', { link: 'pa87654321' }));
    assert.match(out, /Delivery \(BG\): 5\.00 EUR/);
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, deliveryTo: undefined } });
    assert.match(text(await payer('payware_payer_read_link', { link: 'pa87654321' })), /- Delivery: 5\.00 EUR/);
  });

  test('read_link and create_session: a session lists the delivery price per country (review C3)', async () => {
    reset();
    const withCountries = { ...SESSION, delivery: { country: 'BG', countryServed: true, countries: [{ country: 'BG', amount: '5.00' }, { country: 'RO', amount: '12.00' }] } };
    script('GET /links/pa87654321', { status: 200, body: withCountries });
    assert.match(text(await payer('payware_payer_read_link', { link: 'pa87654321' })), /Delivers to 2 countries: BG 5\.00, RO 12\.00 EUR/);
    script('POST /links/pr12345678/sessions', { status: 201, body: withCountries });
    assert.match(text(await payer('payware_payer_create_session', { link: 'pr12345678', quantity: 2 })), /Delivers to 2 countries: BG 5\.00, RO 12\.00 EUR/);
    script('GET /links/pa87654321', { status: 200, body: SESSION });
    assert.ok(!/Delivers to/.test(text(await payer('payware_payer_read_link', { link: 'pa87654321' }))), 'no countries, no line');
    for (const name of ['payware_payer_read_link', 'payware_payer_create_session']) {
      assert.match(tool(getPayerTools(), name).description, /delivery\.countries/, name);
    }
  });

  test('extractLinkId reads ids out of every accepted form', () => {
    assert.equal(extractLinkId('pa12345678'), 'pa12345678');
    assert.equal(extractLinkId('  https://go.payware.eu/pa12345678  '), 'pa12345678');
    assert.equal(extractLinkId('go.payware.eu/pa12345678'), 'pa12345678');
    assert.equal(extractLinkId('https://paywa.re/pl12345678#top'), 'pl12345678');
    assert.equal(extractLinkId('https://sandbox.paywa.re/links/pr12345678'), 'pr12345678');
    assert.throws(() => extractLinkId('https://go.payware.eu/'), /No payware link id/);
    assert.throws(() => extractLinkId('https://go.payware.eu/hello'), /No payware link id/);
  });

  const PRICE = {
    id: 'pr12345678', currency: 'EUR', quantity: 2, total: '85.00',
    items: [{ type: 'ITEM', name: 'Vase', quantity: 2, unitPrice: '40.00', amount: '80.00' }, { type: 'SHIPPING', name: 'Delivery', amount: '5.00' }],
    delivery: { country: 'BG', countryServed: true, countries: [{ country: 'BG', amount: '5.00' }, { country: 'RO', amount: '9.00' }] }
  };

  test('check_price: GET /links/{id}/price with the country and quantity, public, and the person sees the delivered total', async () => {
    reset();
    script('GET /links/pr12345678/price?country=BG&quantity=2', { status: 200, body: PRICE });
    const result = await payer('payware_payer_check_price', { link: 'https://go.payware.eu/pr12345678', country: 'bg', quantity: 2 });
    assert.deepEqual(seen.map(r => `${r.method} ${r.path}`), ['GET /links/pr12345678/price?country=BG&quantity=2'], 'the country goes upper-cased');
    assert.equal(seen[0].headers.authorization, undefined, 'the link host is public: nothing is signed');
    assert.equal(seen[0].body, null, 'a price check sends no body and no address');
    assert.notEqual(result.isError, true);
    const out = text(result);
    assert.match(out, /Total: 85\.00 EUR/);
    assert.match(out, /Delivery \(BG\): 5\.00 EUR/, 'the delivery line is labelled with delivery.country');
    assert.match(out, /Delivered to BG/);
    assert.match(out, /Delivers to 2 countries: BG 5\.00, RO 9\.00 EUR/);
    assert.match(out, /Nothing was created/);
  });

  test('check_price: with neither country nor quantity it sends no query, and a placement link prices too', async () => {
    reset();
    script('GET /links/pr12345678/price', { status: 200, body: { ...PRICE, quantity: 1, delivery: undefined } });
    script('GET /links/pl12345678/price', { status: 200, body: { ...PRICE, id: 'pl12345678', delivery: undefined } });
    await payer('payware_payer_check_price', { link: 'pr12345678' });
    await payer('payware_payer_check_price', { link: 'pl12345678' });
    assert.deepEqual(seen.map(r => r.path), ['/links/pr12345678/price', '/links/pl12345678/price']);
  });

  test('check_price: an unserved country is an answer, not an error, and says a session would be refused', async () => {
    reset();
    script('GET /links/pr12345678/price?country=FR', { status: 200, body: { ...PRICE, quantity: 1, items: [PRICE.items[0]], total: '40.00', delivery: { country: 'FR', countryServed: false, countries: PRICE.delivery.countries } } });
    const result = await payer('payware_payer_check_price', { link: 'pr12345678', country: 'FR' });
    assert.notEqual(result.isError, true);
    assert.match(text(result), /Not delivered to FR/);
    assert.match(text(result), /would be refused/);
  });

  test('check_price: what the server refuses, and a session id, are refused before any request', async () => {
    reset();
    const refuse = args => payer('payware_payer_check_price', { link: 'pr12345678', ...args }).catch(e => ({ isError: true, content: [{ text: e.message }] }));
    for (const args of [{ country: 'BGR' }, { country: '1A' }, { country: '' }, { quantity: 0 }, { quantity: 100 }, { quantity: 1.5 }, { link: 'pa87654321' }, { link: 'pw12345678' }]) {
      const result = await refuse(args);
      assert.equal(result.isError, true, JSON.stringify(args));
    }
    assert.equal(seen.length, 0, 'nothing invalid reaches the link host');
    const session = await refuse({ link: 'https://go.payware.eu/pa87654321' });
    assert.match(text(session), /already carries its price/);
  });

  test('check_price: a server refusal comes back as an error with its status and code', async () => {
    reset();
    script('GET /links/pr12345678/price', { status: 403, body: { errorCode: 'ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN', message: 'Not on this plan', correlationId: 'c-2' } });
    const result = await payer('payware_payer_check_price', { link: 'pr12345678' });
    assert.equal(result.isError, true);
    assert.match(text(result), /403/);
    assert.match(text(result), /ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN/);
  });

  test('check_price says where payware links are real, that nothing is created, and that prices are indicative', () => {
    const { description } = tool(getPayerTools(), 'payware_payer_check_price');
    for (const part of ['go.payware.eu', 'paywa.re', 'own banking app', 'bank credentials', 'Nothing is created', 'indicative', 'ERR_DELIVERY_COUNTRY_NOT_SERVED']) {
      assert.ok(description.includes(part), `the description does not say "${part}"`);
    }
  });

  test('every payer tool keeps the agent off the page\'s address calls, and says the bank re-prices instead of refusing', () => {
    for (const t of getPayerTools()) {
      for (const part of ['PUT /links/{pa}/address', 'POST /links/{pa}/address-confirmation', 'enteredBy']) {
        assert.ok(t.description.includes(part), `${t.name} does not say "${part}"`);
      }
      assert.ok(!t.description.includes('ERR_SESSION_DELIVERY_FEE_DIFFERS'), t.name);
    }
    for (const name of ['payware_payer_read_link', 'payware_payer_create_session', 'payware_payer_watch']) {
      const { description } = tool(getPayerTools(), name);
      assert.match(description, /re-priced, never refused for the price/, name);
      assert.match(description, /records it on the payment as `tip`, never as a line/, name);
      assert.match(description, /Never add a tip yourself/, name);
    }
    assert.match(tool(getPayerTools(), 'payware_payer_create_session').description, /re-priced, not refused/);
    assert.match(tool(getPayerTools(), 'payware_payer_read_link').description, /may replace the address on payware's page/);
    assert.match(tool(getPayerTools(), 'payware_payer_check_price').description, /may add a tip there/);
  });

  test('a full link on a public link host names its environment; a bare id or an explicit base URL keeps the configured one', () => {
    withEnv({ PAYWARE_LINKS_BASE_URL: '' }, () => {
      assert.equal(sandboxFor('https://go.payware.eu/pr12345678', true), false, 'a production link is read in production');
      assert.equal(sandboxFor('paywa.re/pr12345678', true), false);
      assert.equal(sandboxFor('https://go-sandbox.payware.eu/pr12345678', false), true);
      assert.equal(sandboxFor('https://sandbox.paywa.re/pa12345678', false), true);
      assert.equal(sandboxFor('pr12345678', true), true, 'a bare id keeps useSandbox');
      assert.equal(sandboxFor('pr12345678', false), false);
      assert.equal(sandboxFor('http://localhost:8080/pr12345678', false), false);
    });
    withEnv({ PAYWARE_LINKS_BASE_URL: 'http://127.0.0.1:8080' }, () => {
      assert.equal(sandboxFor('https://go.payware.eu/pr12345678', true), true, 'an explicit base URL wins (local server, tests)');
    });
  });

  test('create_session: lines and the address go as POST /links/{id}/sessions, and the person gets the link', async () => {
    reset();
    script('POST /links/pr12345678/sessions', { status: 201, headers: { Location: '/links/pa87654321' }, body: SESSION });
    const address = { fullName: 'Jane Doe', streetAddressLine1: '1 Main St', zipCode: '1000', city: 'Sofia', country: 'BG', email: 'jane@example.com' };
    const lines = [{ productId: 'pr12345678', quantity: 2 }];
    const result = await payer('payware_payer_create_session', { link: 'https://go.payware.eu/pr12345678', lines, deliveryAddress: address });
    assert.deepEqual(seen.map(r => `${r.method} ${r.path}`), ['POST /links/pr12345678/sessions']);
    assert.deepEqual(seen[0].body, { lines, deliveryAddress: address });
    assert.match(seen[0].headers['content-type'], /application\/json/);
    assert.equal(seen[0].headers.authorization, undefined);
    assert.notEqual(result.isError, true);
    const out = text(result);
    assert.match(out, /https:\/\/go\.payware\.eu\/pa87654321/);
    assert.match(out, /Total: 85\.00 EUR/);
    assert.match(out, /Delivery \(BG\)/);
    assert.match(out, /2026-11-15T10:00:00Z/);
  });

  test('create_session: quantity alone, and nothing at all, send the shorthand and an empty body', async () => {
    reset();
    script('POST /links/pr12345678/sessions', { status: 201, body: SESSION });
    await payer('payware_payer_create_session', { link: 'pr12345678', quantity: 3 });
    await payer('payware_payer_create_session', { link: 'pr12345678' });
    assert.deepEqual(seen.map(r => r.body), [{ quantity: 3 }, {}]);
  });

  test('create_session: what the server limits is refused before sending', async () => {
    reset();
    const refuse = args => payer('payware_payer_create_session', { link: 'pr12345678', ...args });
    const bad = [
      { lines: [{ productId: 'pr12345678', quantity: 1 }], quantity: 1 },
      { lines: [] },
      { lines: Array.from({ length: 21 }, (_, i) => ({ productId: `pr${String(i).padStart(8, '0')}`, quantity: 1 })) },
      { lines: [{ productId: 'pr12345678', quantity: 100 }] },
      { lines: [{ productId: 'pr12345678', quantity: 0 }] },
      { lines: [{ productId: 'pr12345678', quantity: 1 }, { productId: 'pr12345678', quantity: 1 }] },
      { quantity: 1.5 }
    ];
    for (const args of bad) {
      const result = await refuse(args).catch(e => ({ isError: true, content: [{ text: e.message }] }));
      assert.equal(result.isError, true, JSON.stringify(args).slice(0, 80));
    }
    assert.equal(seen.length, 0);
    assert.throws(() => sessionBody({ lines: [{ productId: 'pr12345678', quantity: 1 }], quantity: 1 }), /not both/);
  });

  test('create_session: a server refusal comes back as an error with its code, and the address is never echoed', async () => {
    reset();
    script('POST /links/pr12345678/sessions', { status: 409, body: { errorCode: 'ERR_DELIVERY_COUNTRY_NOT_SERVED', message: 'Not delivered there', correlationId: 'c-1' } });
    const result = await payer('payware_payer_create_session', {
      link: 'pr12345678',
      deliveryAddress: { fullName: 'Jane Doe', streetAddressLine1: '1 Main St', zipCode: '1000', city: 'Sofia', country: 'RO', phoneNumber: '+359 88 000 0000' }
    });
    assert.equal(result.isError, true);
    assert.match(text(result), /409/);
    assert.match(text(result), /ERR_DELIVERY_COUNTRY_NOT_SERVED/);
    assert.ok(!text(result).includes('1 Main St'), 'the address must not appear in the result');
  });

  test('create_session says where payware links are real, that the bank approves, no credentials, and that payments are final', () => {
    const { description } = tool(getPayerTools(), 'payware_payer_create_session');
    for (const part of ['go.payware.eu', 'paywa.re', 'go-sandbox.payware.eu', 'sandbox.paywa.re', 'localhost', 'own banking app', 'bank credentials', 'final']) {
      assert.ok(description.includes(part), `the description does not say "${part}"`);
    }
  });

  test('watch: polls until PAID and returns it, reading the same link each time', async () => {
    reset();
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, status: 'AVAILABLE' } }, { status: 200, body: { ...SESSION, status: 'IN_PROGRESS' } }, { status: 200, body: { ...SESSION, status: 'PAID' } });
    const result = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa87654321', timeoutSeconds: 30, intervalMs: 5 }));
    assert.equal(result.final, true);
    assert.equal(result.link.status, 'PAID');
    assert.equal(result.polls, 3);
    assert.deepEqual(seen.map(r => r.path), ['/links/pa87654321', '/links/pa87654321', '/links/pa87654321']);
  });

  test('watch stops on every final status of the server: PAID, NOT_PAID, EXPIRED, CANCELLED and UNAVAILABLE', async () => {
    assert.deepEqual([...FINAL_STATUSES].sort(), ['CANCELLED', 'EXPIRED', 'NOT_PAID', 'PAID', 'UNAVAILABLE']);
    const PAYMENT = { id: 'pw87654321', kind: 'TRANSACTION', environment: 'SANDBOX', amount: '10.00', currency: 'EUR', reason: 'Order 17', pay: [], link: 'https://go.payware.eu/pw87654321' };
    for (const status of FINAL_STATUSES) {
      reset();
      // NOT_PAID and CANCELLED are a payment's (pw) statuses; a session is never either itself.
      const [id, body] = ['NOT_PAID', 'CANCELLED'].includes(status) ? ['pw87654321', { ...PAYMENT, status }] : ['pa87654321', { ...SESSION, status }];
      script(`GET /links/${id}`, { status: 200, body });
      const result = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id, timeoutSeconds: 30, intervalMs: 5 }));
      assert.equal(result.final, true, status);
      assert.equal(result.polls, 1, status);
    }
    for (const status of ['AVAILABLE', 'WAITING', 'IN_PROGRESS', 'NO_PAYMENT_WAITING']) assert.ok(!FINAL_STATUSES.includes(status), status);
  });

  test('watch: a session whose attempt did not pay is AVAILABLE again: not final, and the person may retry', async () => {
    reset();
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, lastPayment: { status: 'NOT_PAID' } } }, { status: 200, body: { ...SESSION, status: 'PAID', pay: [] } });
    const result = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa87654321', timeoutSeconds: 30, intervalMs: 5 }));
    assert.equal(result.final, true);
    assert.equal(result.link.status, 'PAID');
    assert.equal(result.polls, 2, 'the failed attempt did not end the watch');

    reset();
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, lastPayment: { status: 'NOT_PAID' } } });
    const out = text(await payer('payware_payer_watch', { link: 'pa87654321', timeoutSeconds: 1 }));
    assert.match(out, /not final/);
    assert.match(out, /may try again from the same link/);
  });

  test('watch: a 429 waits as long as its Retry-After says, at most 60 s, and a wait past the time limit ends the watch with the advice', async () => {
    const LIMITED = seconds => ({ status: 429, headers: { 'Retry-After': String(seconds) }, body: { errorCode: 'ERR_RATE_LIMIT_EXCEEDED', message: 'Too many requests' } });
    const PAID = { status: 200, body: { ...SESSION, status: 'PAID', pay: [] } };
    const waits = [];
    const sleep = async ms => { waits.push(ms); };
    const watch = timeoutSeconds => withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa87654321', timeoutSeconds, intervalMs: 5, sleep }));

    reset();
    script('GET /links/pa87654321', LIMITED(7), PAID);
    const honoured = await watch(30);
    assert.equal(honoured.link.status, 'PAID');
    assert.deepEqual(waits, [7000]);

    reset(); waits.length = 0;
    script('GET /links/pa87654321', LIMITED(3600), PAID);
    const capped = await watch(120);
    assert.equal(capped.link.status, 'PAID');
    assert.deepEqual(waits, [60000], 'bounded at 60 s');

    reset(); waits.length = 0;
    script('GET /links/pa87654321', LIMITED(60));
    const stopped = await watch(10);
    assert.equal(stopped.timedOut, true);
    assert.equal(stopped.polls, 1, 'no read against the limit');
    assert.deepEqual(waits, []);
    assert.equal(stopped.lastError.status, 429);
    assert.equal(stopped.lastError.retryAfterSeconds, 60);

    reset();
    script('GET /links/pa87654321', LIMITED(60));
    const out = text(await payer('payware_payer_watch', { link: 'pa87654321', timeoutSeconds: 10 }));
    assert.match(out, /limiting requests from here: wait 60 seconds/);
  });

  test('retryAfterSeconds reads seconds and HTTP dates, and nothing else', () => {
    assert.equal(retryAfterSeconds('60'), 60);
    assert.equal(retryAfterSeconds(' 5 '), 5);
    const inTen = new Date(Date.now() + 10000).toUTCString();
    assert.ok(retryAfterSeconds(inTen) >= 8 && retryAfterSeconds(inTen) <= 11, String(retryAfterSeconds(inTen)));
    assert.equal(retryAfterSeconds(new Date(Date.now() - 10000).toUTCString()), 0);
    for (const v of [undefined, null, '', 'soon']) assert.equal(retryAfterSeconds(v), undefined, String(v));
  });

  test('watch: a time-out is a result with the last state, not an error', async () => {
    reset();
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, status: 'WAITING' } });
    const result = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa87654321', timeoutSeconds: 1, intervalMs: 100 }));
    assert.equal(result.success, true);
    assert.equal(result.final, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.link.status, 'WAITING');
    assert.ok(result.polls >= 2 && result.polls <= 12, `${result.polls} polls`);
  });

  test('watch: one failed read does not lose a payment in progress; a 404 ends the watch', async () => {
    reset();
    script('GET /links/pa87654321', { status: 503, body: { errorCode: 'ERR_X', message: 'down' } }, { status: 200, body: { ...SESSION, status: 'PAID' } });
    const recovered = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa87654321', timeoutSeconds: 30, intervalMs: 5 }));
    assert.equal(recovered.link.status, 'PAID');
    assert.equal(recovered.polls, 2);

    reset();
    const gone = await withEnv({ PAYWARE_LINKS_BASE_URL: hostUrl }, () => watchLink({ id: 'pa00000000', timeoutSeconds: 30, intervalMs: 5 }));
    assert.equal(gone.success, false);
    assert.equal(gone.lastError.status, 404);
    assert.equal(gone.polls, 1);
  });

  test('watch: the tool bounds the wait (default 120 s, at most 600 s) and reports a final state', async () => {
    const schema = tool(getPayerTools(), 'payware_payer_watch').inputSchema.properties.timeoutSeconds;
    assert.deepEqual([schema.default, schema.maximum], [120, 600]);

    reset();
    script('GET /links/pa87654321', { status: 200, body: { ...SESSION, status: 'PAID' } });
    const result = await payer('payware_payer_watch', { link: 'https://go.payware.eu/pa87654321', timeoutSeconds: 5 });
    assert.notEqual(result.isError, true);
    assert.match(text(result), /\*\*PAID\*\*/);
    assert.match(text(result), /The payment is done/);
  });

  test('the links base: sandbox and production hosts by default, PAYWARE_LINKS_BASE_URL overrides both, slashes trimmed', async () => {
    await withEnv({ PAYWARE_LINKS_BASE_URL: undefined }, () => {
      assert.equal(getLinksUrl(), 'https://go-sandbox.payware.eu');
      assert.equal(getLinksUrl(true), 'https://go-sandbox.payware.eu');
      assert.equal(getLinksUrl(false), 'https://go.payware.eu');
    });
    await withEnv({ PAYWARE_LINKS_BASE_URL: 'http://localhost:8080//' }, () => {
      assert.equal(getLinksUrl(true), 'http://localhost:8080');
      assert.equal(getLinksUrl(false), 'http://localhost:8080');
    });
  });
});
