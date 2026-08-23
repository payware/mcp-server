import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { getMerchantTools } from '../src/merchant/index.js';
import { getISVTools } from '../src/isv/index.js';
import { getPaymentInstitutionTools } from '../src/payment-institution/index.js';

/**
 * Structural checks on every tool this server exposes.
 *
 * None of this needs a network, a key or an environment. It is the cheap half of the suite and it
 * catches the failure mode that is hardest to notice by hand: a tool that loads fine and is simply
 * wrong in a way no single code path exercises.
 */

const ROLES = [
  { name: 'merchant', tools: getMerchantTools(), registry: 'src/merchant/index.js' },
  { name: 'isv', tools: getISVTools(), registry: 'src/isv/index.js' },
  { name: 'payment_institution', tools: getPaymentInstitutionTools(), registry: 'src/payment-institution/index.js' }
];

describe('tool contract', () => {
  for (const role of ROLES) {
    describe(role.name, () => {
      test('exposes at least one tool', () => {
        assert.ok(role.tools.length > 0, `${role.name} exposes no tools - the registry import probably broke`);
      });

      test('every tool is well formed', () => {
        for (const tool of role.tools) {
          assert.ok(tool.name, `a ${role.name} tool has no name`);
          assert.equal(typeof tool.description, 'string', `${tool.name}: description must be a string`);
          assert.ok(tool.description.length > 0, `${tool.name}: description is empty`);
          assert.equal(typeof tool.handler, 'function', `${tool.name}: handler must be a function`);
          assert.ok(tool.inputSchema, `${tool.name}: missing inputSchema`);
          assert.equal(tool.inputSchema.type, 'object', `${tool.name}: inputSchema.type must be "object"`);
        }
      });

      test('tool names are unique', () => {
        const seen = new Map();
        for (const tool of role.tools) {
          assert.ok(!seen.has(tool.name),
            `${tool.name} is registered twice for ${role.name} - the later one silently shadows the earlier`);
          seen.set(tool.name, true);
        }
      });

      test('every required parameter is declared in properties', () => {
        // A `required` entry with no matching property is invisible to a client: it cannot prompt
        // for a parameter it has no schema for, so the call goes out missing it and fails server-side
        // with an error that names the API field rather than the tool parameter.
        for (const tool of role.tools) {
          const required = tool.inputSchema.required ?? [];
          const properties = tool.inputSchema.properties ?? {};
          for (const key of required) {
            assert.ok(key in properties,
              `${tool.name}: "${key}" is required but has no entry in inputSchema.properties`);
          }
        }
      });

      test('every parameter has a description', () => {
        for (const tool of role.tools) {
          for (const [key, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
            assert.ok(schema.description && schema.description.length > 0,
              `${tool.name}: parameter "${key}" has no description - an assistant has nothing to fill it in from`);
          }
        }
      });

      test('tool names follow payware_<group>_<verb>', () => {
        for (const tool of role.tools) {
          assert.match(tool.name, /^payware_[a-z0-9]+(_[a-z0-9]+)+$/,
            `${tool.name}: expected payware_<group>_<verb>, lowercase with underscores`);
        }
      });

      test('getXTools() does not rename anything', () => {
        // Each registry has a long if/else chain in getXTools() that looks like it groups tool names.
        // It does not: every branch assigns `newName = tool.name`, which is the value newName already
        // holds, so the chain is a no-op and a tool whose prefix has no branch (payware_generate_*,
        // since it was added) behaves exactly like one that does.
        //
        // This test pins that. It is not asserting the chain is good design - it is asserting the
        // chain stays harmless, because the one way it could start mattering is if somebody "fixed"
        // a branch to actually rewrite a name. That would silently change tool names for every
        // connected client, and no other test would see it.
        const source = readFileSync(new URL(`../${role.registry}`, import.meta.url), 'utf8');
        const assignments = source.match(/newName = (?!tool\.name)/g) ?? [];
        assert.equal(assignments.length, 0,
          `${role.registry}: a getXTools() branch now assigns something other than tool.name. ` +
          `That renames a published tool - see the note in CLAUDE.md before changing this.`);
      });
    });
  }

  // Parameters that exist for one role and not another, on purpose. Listing them here is the point:
  // an undeclared divergence still fails the test, so a field that quietly appears in one role's
  // schema and not another's gets caught rather than absorbed.
  const AUTH_PARAMS = ['partnerId', 'privateKey', 'useSandbox', 'merchantPartnerId', 'oauth2Token', 'isvPartnerId'];
  // Keyed tool -> role -> params, so each exclusion is attributed to the role that owns it rather
  // than blanket-excluded everywhere.
  const ROLE_SPECIFIC_PARAMS = {
    payware_operations_create_transaction: {
      // POS terminal producer attribution is merchant-only by design: whoever made the API call owns
      // the sale, so an ISV call is an ISV sale even on a producer's hardware, and payware would not
      // honour these on an on-behalf call. See server/docs/producer-attribution-integrator-guide.md.
      merchant: ['producerPartnerId', 'terminalId', 'terminalManufacturer'],
      // A merchant transaction belongs to one of the merchant's outlets. A financial institution has
      // no shops; it declares instead whether it is the payer or the payee side of the transfer
      // (SRC/DST), which merchants never do because a merchant is always the payee.
      merchant_only: ['shop'],
      payment_institution: ['role']
    },
    payware_operations_process_transaction: {
      // Same split as create: a merchant processes into one of its outlets, a financial institution
      // has none.
      merchant_only: ['shop'],
      // The shopper's delivery address is supplied by the institution at process time and is
      // mandatory for a SHIPPABLE transaction. A merchant never sends it - it collects the address
      // afterwards from GET /transactions-history/{id}, which is why it left the callback.
      payment_institution: ['deliveryAddress']
    },
    payware_operations_simulate_callback: {
      // Merchants receive TRANSACTION_FINALIZED only. Financial institutions receive that AND
      // TRANSACTION_PROCESSED, which carries the participants, the reason lines and the processing
      // window - so the FI simulator needs the fields to build both payloads, and a callbackType to
      // choose between them.
      payment_institution: [
        'callbackType', 'payeeAccount', 'payeeBIC', 'payeeFriendlyName',
        'payerAccount', 'payerBIC', 'payerFriendlyName', 'reasonL1', 'reasonL2', 'timeToLive'
      ],
      // The ISV simulator labels its output with the merchant whose callback it models. It is a
      // display label, not an on-behalf credential - simulation is local and calls nothing.
      isv: ['merchantPartnerId']
    },
    payware_data_download_export: {
      // A local convenience the merchant tool has and the ISV tool does not: write the downloaded
      // export straight to a file. Not a contract difference - both call the same endpoint - but a
      // real gap on the ISV side, whose tools are generated by a shared factory that has no notion
      // of it. Declared rather than fixed because adding it means changing that factory for all ten
      // ISV data tools, which is its own change.
      merchant: ['saveToFile']
    }
  };

  /** Params this role is declared to have on its own for this tool. */
  const declaredFor = (toolName, roleName) => {
    const entry = ROLE_SPECIFIC_PARAMS[toolName];
    if (!entry) return [];
    return [
      ...(entry[roleName] ?? []),
      // `merchant_only` covers a param the merchant and ISV share and the FI does not.
      ...(roleName !== 'payment_institution' ? (entry.merchant_only ?? []) : [])
    ];
  };

  test('a tool name means the same thing in every role that has it', () => {
    // payware_operations_create_transaction exists for all three roles with different
    // implementations, which is fine. What is not fine is the same name meaning different things -
    // an integrator reading the docs for one role and calling another gets a surprise.
    const byName = new Map();
    for (const role of ROLES) {
      for (const tool of role.tools) {
        if (!byName.has(tool.name)) byName.set(tool.name, []);
        byName.get(tool.name).push({ role: role.name, tool });
      }
    }
    for (const [name, entries] of byName) {
      if (entries.length < 2) continue;
      const shapes = entries.map(e => ({
        role: e.role,
        // Compare the SHAPE, not the prose: role-specific descriptions and auth parameters
        // legitimately differ. What must not differ is the set of business parameters, minus the
        // ones a role is DECLARED to have on its own.
        params: Object.keys(e.tool.inputSchema.properties ?? {})
          .filter(k => !AUTH_PARAMS.includes(k))
          .filter(k => !declaredFor(name, e.role).includes(k))
          .sort()
      }));
      const first = shapes[0];
      for (const other of shapes.slice(1)) {
        assert.deepEqual(other.params, first.params,
          `${name}: business parameters differ between ${first.role} and ${other.role}.\n` +
          `  ${first.role}: ${first.params.join(', ')}\n` +
          `  ${other.role}: ${other.params.join(', ')}`);
      }
    }
  });
});

describe('the test script itself', () => {
  test('names every test file', () => {
    // package.json lists test files explicitly rather than globbing. `node --test "tests/*.test.js"`
    // works on Node 22 and silently matches nothing on Node 18, where glob expansion does not exist -
    // which is how CI went green locally and red on the declared engines floor. A directory argument
    // is no better: this Node rejects `node --test tests` outright.
    //
    // Explicit is portable across every version and shell. The cost is that a new test file has to be
    // added to the script, and a file that is never run looks identical to one that passes. This test
    // is that cost paid once.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const script = pkg.scripts.test;
    const onDisk = readdirSync(new URL('../tests/', import.meta.url))
      .filter(f => f.endsWith('.test.js'))
      .sort();

    const missing = onDisk.filter(f => !script.includes(`tests/${f}`));
    assert.deepEqual(missing, [],
      `package.json "test" does not run: ${missing.join(', ')} - add them or they never run`);
  });
});

describe('surface coverage', () => {
  // These are the tools whose absence was a real gap. Naming them keeps a future refactor from
  // dropping one back out without anybody noticing.
  const EXPECTED = {
    merchant: ['payware_shops_list'],
    isv: [
      'payware_shops_list',
      'payware_poi_create',
      'payware_poi_create_batch',
      'payware_reference_lookup',
      'payware_isv_create_invitation',
      'payware_isv_list_invitations',
      'payware_isv_get_invitation',
      'payware_isv_cancel_invitation'
    ]
  };

  for (const [roleName, expected] of Object.entries(EXPECTED)) {
    test(`${roleName} exposes its expected tools`, () => {
      const role = ROLES.find(r => r.name === roleName);
      const have = new Set(role.tools.map(t => t.name));
      const missing = expected.filter(n => !have.has(n));
      assert.deepEqual(missing, [], `${roleName} is missing: ${missing.join(', ')}`);
    });
  }
});
