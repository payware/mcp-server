import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TOOLSETS, toolsetOf, filterToolsets } from '../src/config/toolsets.js';
import { getMerchantTools } from '../src/merchant/index.js';
import { getISVTools } from '../src/isv/index.js';
import { getPaymentInstitutionTools } from '../src/payment-institution/index.js';

/**
 * PAYWARE_MCP_TOOLSETS: which tools a client is offered.
 *
 * The default must stay "everything", so nobody who upgrades loses a tool they did not ask to lose;
 * and a mistake in the setting must be loud on stderr rather than quietly serving nothing.
 */

const merchant = getMerchantTools();
const ROLES = { merchant, isv: getISVTools(), payment_institution: getPaymentInstitutionTools() };

describe('toolset membership', () => {
  test('every tool belongs to a toolset', () => {
    const orphans = Object.values(ROLES).flat().map(t => t.name).filter(n => toolsetOf(n) === null);
    assert.deepEqual([...new Set(orphans)], [], 'place these in src/config/toolsets.js');
  });

  test('every toolset has tools in some role', () => {
    const used = new Set(Object.values(ROLES).flat().map(t => toolsetOf(t.name)));
    const empty = Object.keys(TOOLSETS).filter(s => !used.has(s));
    assert.deepEqual(empty, [], 'a toolset nothing belongs to is a name that can only confuse');
  });

  test('placement and airing tools are placements, not products, despite their prefix', () => {
    assert.equal(toolsetOf('payware_products_create_placement'), 'placements');
    assert.equal(toolsetOf('payware_products_get_airing_calendar'), 'placements');
    assert.equal(toolsetOf('payware_campaigns_get_campaign_stats'), 'placements');
    assert.equal(toolsetOf('payware_products_create_schedule'), 'products');
  });
});

describe('filterToolsets', () => {
  test('unset, blank or all loads every tool', () => {
    for (const setting of [undefined, '', '  ', 'all', 'products,all']) {
      const { tools, selected, warnings } = filterToolsets(merchant, setting);
      assert.equal(tools.length, merchant.length, `setting ${JSON.stringify(setting)}`);
      assert.equal(selected, null);
      assert.deepEqual(warnings, []);
    }
  });

  test('named toolsets load only their tools', () => {
    const { tools, selected, warnings } = filterToolsets(merchant, 'products,placements');
    assert.deepEqual(selected, ['products', 'placements']);
    assert.deepEqual(warnings, []);
    assert.ok(tools.length > 0);
    assert.ok(tools.every(t => ['products', 'placements'].includes(toolsetOf(t.name))));
    assert.ok(!tools.some(t => t.name === 'payware_operations_create_transaction'));
  });

  test('names are forgiving about case, spaces and hyphens', () => {
    const { selected, warnings } = filterToolsets(merchant, ' Deep-Links , PLACEMENTS ');
    assert.deepEqual(selected, ['placements', 'deep_links']);
    assert.deepEqual(warnings, []);
  });

  test('an unknown name is ignored and named in a warning', () => {
    const { selected, warnings } = filterToolsets(merchant, 'products,placement');
    assert.deepEqual(selected, ['products']);
    assert.match(warnings[0], /unknown toolset placement ignored/);
    assert.match(warnings[0], /Known: auth, transactions/);
  });

  test('only unknown names loads every tool rather than none', () => {
    const { tools, selected, warnings } = filterToolsets(merchant, 'prodcts');
    assert.equal(tools.length, merchant.length);
    assert.equal(selected, null);
    assert.match(warnings.at(-1), /every tool is loaded/);
  });

  test('a toolset with no tools for the role is a warning', () => {
    // Points of interaction are an ISV feature; a merchant asking for them gets told so.
    const { tools, warnings } = filterToolsets(merchant, 'poi,shops');
    assert.ok(tools.every(t => toolsetOf(t.name) === 'shops'));
    assert.match(warnings[0], /toolset poi has no tools for this partner type/);
  });
});

describe('toolset documentation', () => {
  test('every place that lists the toolsets names all of them', () => {
    // The list is repeated for readers in four files; a toolset added here and not there is one a
    // user cannot discover.
    // Short names such as auth or data occur in ordinary prose, so the check is for the form each
    // file lists them in: backticked in the Markdown, the whole list in order elsewhere.
    const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const file of ['README.md', 'docs/MCP-SETUP.md']) {
      const text = read(file);
      const missing = Object.keys(TOOLSETS).filter(name => !text.includes(`\`${name}\``));
      assert.deepEqual(missing, [], `${file} does not list these toolsets`);
    }
    for (const file of ['.env.example', 'server.json']) {
      assert.ok(read(file).includes(Object.keys(TOOLSETS).join(', ')), `${file} does not list the toolsets in order`);
    }
  });
});
