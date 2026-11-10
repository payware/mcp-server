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
      //
      // deferredAllowed (the deferred Merchant Leg opt-in, server docs/execution-lock.md) is a
      // merchant's choice, made on its own call or an ISV's call for it. The institution tool must
      // never get it: a bank-created transaction is always instant or internal.
      merchant_only: ['shop', 'deferredAllowed'],
      payment_institution: ['role']
    },
    payware_operations_process_transaction: {
      // Same split as create: a merchant processes into one of its outlets, a financial institution
      // has none.
      merchant_only: ['shop'],
      // The shopper's delivery address is supplied by the institution at process time and is
      // mandatory for a SHIPPABLE transaction. A merchant never sends it - it collects the address
      // afterwards from GET /transactions-history/{id}, which is why it left the callback.
      // paymentMethod is the institution's to state: the server stores it on a bank's process only
      // (TransactionService), so the merchant and ISV tools no longer offer it.
      payment_institution: ['deliveryAddress', 'paymentMethod']
    },
    payware_operations_simulate_callback: {
      // Merchants receive TRANSACTION_FINALIZED only. Financial institutions receive that AND
      // TRANSACTION_PROCESSED, which carries the participants, the reason lines and the processing
      // window - so the FI simulator needs the fields to build both payloads, and a callbackType to
      // choose between them.
      payment_institution: [
        'callbackType', 'payeeAccount', 'payeeBIC', 'payeeFriendlyName', 'payeeRegisteredName',
        'payeeRegisteredId', 'payeeVatId',
        'payerBIC', 'payerFriendlyName', 'reasonL1', 'reasonL2', 'timeToLive'
      ],
      // The ISV simulator labels its output with the merchant whose callback it models. It is a
      // display label, not an on-behalf credential - simulation is local and calls nothing.
      isv: ['merchantPartnerId']
    },
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

describe('tool text', () => {
  test('names only tools that exist', () => {
    // Descriptions and results steer the model to the next tool by name, so a renamed tool leaves a
    // trail of instructions to call something that is not there. payware_pi_* and
    // payware_transactions_* survived the move to payware_operations_* in 13 files this way.
    const names = new Set(ROLES.flatMap(r => r.tools.map(t => t.name)));
    // Group prefixes ("payware_data") are legitimate in prose and in the registries.
    const isPrefix = token => [...names].some(n => n.startsWith(`${token}_`));
    // Not a tool name: an identifier in generated sample code.
    const NOT_TOOLS = new Set(['payware_client']);

    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []);

    const unknown = [];
    for (const file of walk(new URL('../src/', import.meta.url))) {
      for (const [token] of readFileSync(file, 'utf8').matchAll(/\bpayware_[a-z0-9_]*[a-z0-9]\b/g)) {
        if (!names.has(token) && !isPrefix(token) && !NOT_TOOLS.has(token)) {
          unknown.push(`${file.pathname.split('/src/')[1]}: ${token}`);
        }
      }
    }
    assert.deepEqual([...new Set(unknown)], [], 'these name a tool that does not exist');
  });
});

describe('code examples', () => {
  // The routes the generated programs call, from server/ controllers (TransactionController,
  // TransactionHistoryController, ApiProductController, AudioController, Oauth2Controller,
  // ReportApiController), not from what the generator sends. A new operation has to say what it calls.
  const SERVER_ROUTES = new Set([
    'POST /api/transactions', 'GET /api/transactions/{transactionId}', 'POST /api/transactions/{transactionId}',
    'PATCH /api/transactions/{transactionId}', 'GET /api/transactions-history/{transactionId}',
    'POST /api/products', 'GET /api/products', 'GET /api/products/{productId}', 'PATCH /api/products/{productId}',
    'DELETE /api/products/{productId}', 'POST /api/products/{productId}/audios/upload', 'GET /api/products/{productId}/audios',
    'GET /api/products/{productId}/audios/{audioId}', 'PATCH /api/products/{productId}/audios/{audioId}',
    'DELETE /api/products/{productId}/audios/{audioId}',
    'POST /oauth2/tokens', 'GET /oauth2/tokens/{token}', 'POST /oauth2/tokens/{token}/rotate',
    'GET /api/data-retrieval/reports', 'POST /api/data-retrieval', 'GET /api/data-retrieval/request/{requestId}/status',
    'POST /api/data-retrieval/request/{requestId}/export/{outputFormat}'
  ]);
  const generator = async () => (await import('../src/tools/advanced-code-generator.js')).advancedCodeGenerator;
  const routeOf = def => `${def.method} ${def.base === 'host' ? '' : '/api'}${def.path}`;

  test('every operation offered is defined, and calls a route the server has', async () => {
    const g = await generator();
    const { generateCodeExampleTool } = await import('../src/tools/advanced-code-generator.js');
    // The list offered and the operations defined were different sets: four offered operations answered
    // "Unknown operation", and others called /data/reports, /api/oauth2 and a non-existent finalize route.
    assert.deepEqual([...generateCodeExampleTool.inputSchema.properties.operation.enum].sort(),
      Object.keys(g.operationDefinitions).sort());
    for (const partnerType of g.partnerTypes) {
      for (const operation of Object.keys(g.operationDefinitions)) {
        if (operation === 'authentication' || !g.operationDefinitions[operation].partnerTypes.includes(partnerType)) continue;
        const def = g.definitionFor(operation, partnerType);
        for (const request of def.steps ?? [def]) {
          assert.ok(SERVER_ROUTES.has(routeOf({ base: 'api', ...request })), `${operation} (${partnerType}): ${routeOf({ base: 'api', ...request })} is not a server route`);
        }
      }
    }
  });

  // The institution finalize (server docs/execution-lock.md) is PATCH /api/transactions/{id}, sent as
  // EXECUTING immediately before money moves and then as CONFIRMED or FAILED. The examples used to
  // show POST /transactions/{id}/finalize, which does not exist, with a CONFIRMED-only body.
  test('the finalize example is the PATCH flow of the execution lock, in every language', async () => {
    const g = await generator();
    for (const language of g.supportedLanguages) {
      for (const includeComments of [true, false]) {
        const out = g.generateExample('finalize_transaction', language, 'payment_institution', { includeComments, includeErrorHandling: true });
        const where = `${language}${includeComments ? '' : ' (no comments)'}`;
        assert.ok(!out.includes('/finalize'), `${where}: names a /finalize route`);
        assert.match(out, /PATCH|\.patch\(/, `${where}: no PATCH`);
        for (const word of ['EXECUTING', 'transferType', 'CONFIRMED', 'FAILED']) {
          assert.ok(out.includes(word), `${where}: no ${word}`);
        }
        const steps = ['Step 1 - process', 'Step 2 - EXECUTING', 'Step 3 - CONFIRMED', 'Or step 3 - FAILED'].map(t => out.indexOf(t));
        assert.ok(steps.every((at, i) => at >= 0 && (i === 0 || at > steps[i - 1])), `${where}: the steps are missing or out of order`);
        if (includeComments) {
          assert.ok(out.includes('PATCH /api/transactions/{transactionId}'), `${where}: does not name the route`);
          assert.match(out, /60 seconds/, `${where}: does not mention the stuck-lock alert`);
        }
      }
    }
  });

  test('finalize is offered to an institution only, and the payer institution sends no account', async () => {
    const g = await generator();
    assert.throws(() => g.generateExample('finalize_transaction', 'curl', 'merchant'), /not available/);
    for (const operation of ['process_transaction', 'create_transaction']) {
      const out = g.generateExample(operation, 'curl', 'payment_institution', { includeComments: false });
      assert.ok(!out.includes('"account"'), `${operation}: payware does not keep the payer account; the payer institution sends none`);
    }
  });

  test('an ISV signs on behalf of the merchant, except at /oauth2', async () => {
    const g = await generator();
    for (const language of g.supportedLanguages) {
      const forMerchant = g.generateExample('create_transaction', language, 'isv', { includeComments: false });
      const forItself = g.generateExample('obtain_token', language, 'isv', { includeComments: false });
      assert.ok(forMerchant.includes('PAYWARE_MERCHANT_PARTNER_ID') && forMerchant.includes('PAYWARE_OAUTH2_TOKEN'), `${language}: create_transaction is not on behalf`);
      assert.ok(!forItself.includes('PAYWARE_OAUTH2_TOKEN'), `${language}: obtain_token is signed on behalf`);
      assert.ok(!forItself.includes('/api/oauth2') && forItself.includes('/oauth2/tokens'), `${language}: /oauth2 is served at the host root`);
    }
  });

  test('every program signs with a real JWT: typ JWT, RS256, contentSha256 in the header for a body', async () => {
    // The Java, C# and curl examples sent a placeholder token, and curl put the hash in an HTTP header.
    const g = await generator();
    for (const language of g.supportedLanguages) {
      const out = g.generateExample('cancel_transaction', language, 'merchant', { includeComments: false });
      assert.ok(out.includes('contentSha256'), `${language}: no contentSha256`);
      assert.ok(!/your-jwt-token|Content-SHA256:/.test(out), `${language}: a placeholder token or a Content-SHA256 HTTP header`);
      assert.ok(/RS256/.test(out) && /JWT/.test(out), `${language}: not an RS256 JWT`);
    }
  });

  test('no example leaks a variable of the generator into the code it generates', async () => {
    // The Python and Node.js templates printed opDef.description inside the generated program, where
    // no opDef exists, so every one of them threw on its success path. And 77 of 80 Python examples did
    // not parse: a JWT helper indented under nothing, an empty if block, a '//' comment.
    const g = await generator();
    const depth = line => line.match(/^ */)[0].length;
    for (const partnerType of g.partnerTypes) {
      for (const [operation, def] of Object.entries(g.operationDefinitions)) {
        if (!def.partnerTypes.includes(partnerType)) continue;
        for (const language of g.supportedLanguages) {
          for (const includeComments of [true, false]) {
            const out = g.generateExample(operation, language, partnerType, { includeComments, includeErrorHandling: true });
            const where = `${language} ${operation} (${partnerType}${includeComments ? '' : ', no comments'})`;
            for (const leak of ['opDef', 'undefined', '[object Object]', 'example_123', 'NaN']) {
              assert.ok(!out.includes(leak), `${where} contains ${leak}`);
            }
            if (language !== 'python') continue;
            // No Python parser here, so the two shapes that broke it: a '//' comment, and a line opening a
            // block (def, if, try, else, except) whose next non-blank line is not indented deeper. Without
            // comments the output is the code itself.
            const blocks = includeComments ? [...out.matchAll(/```python\n([\s\S]*?)```/g)].map(m => m[1]) : [out];
            for (const code of blocks) {
              assert.ok(!/^\s*\/\/ /m.test(code), `${where} has a // comment`);
              const lines = code.split('\n');
              lines.forEach((line, i) => {
                if (!/^\s*(def|if|elif|else|try|except|finally|for|while|with)\b.*:\s*(#.*)?$/.test(line)) return;
                const next = lines.slice(i + 1).find(l => l.trim() !== '');
                assert.ok(next !== undefined && depth(next) > depth(line), `${where}: nothing indented under "${line.trim()}"`);
              });
            }
          }
        }
      }
    }
  });

  test('the documentation tool answers, and names only operations that exist', async () => {
    // It threw on every call (supportedFrameworks was never defined) and offered a framework option
    // the code example tool refuses.
    const { generateDocumentationTool, advancedCodeGenerator: g } = await import('../src/tools/advanced-code-generator.js');
    for (const partner_type of g.partnerTypes) {
      const result = await generateDocumentationTool.handler({ language: 'curl', partner_type });
      const text = result.content[0].text;
      assert.ok(!text.startsWith('❌') && !/framework|undefined/i.test(text), `${partner_type}: ${text.slice(0, 120)}`);
      for (const [, op] of text.matchAll(/^- ([a-z_]+):/gm)) {
        assert.ok(op in g.operationDefinitions, `${partner_type}: names ${op}`);
      }
    }
  });

  test('no source file names the finalize route that does not exist', () => {
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []);
    const offenders = walk(new URL('../src/', import.meta.url))
      .filter(file => /['"`][^'"`\n]*\/transactions\/\{id\}\/finalize/.test(readFileSync(file, 'utf8')))
      .map(file => file.pathname.split('/src/')[1]);
    assert.deepEqual(offenders, [], 'these still name /transactions/{id}/finalize');
  });
});

describe('annotations', () => {
  const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

  for (const role of ROLES) {
    test(`${role.name}: every tool sets all four hints`, () => {
      // Left out, a hint takes the protocol default, which is the cautious one - so an unannotated
      // read is presented to the user as a destructive call. See src/shared/tool-annotations.js.
      for (const tool of role.tools) {
        assert.ok(tool.annotations, `${tool.name}: no annotations - use a preset from src/shared/tool-annotations.js`);
        for (const hint of HINTS) {
          assert.equal(typeof tool.annotations[hint], 'boolean', `${tool.name}: ${hint} must be true or false`);
        }
        if (tool.annotations.readOnlyHint) {
          assert.equal(tool.annotations.destructiveHint, false, `${tool.name}: read-only cannot be destructive`);
        }
      }
    });
  }

  test('a tool is annotated the same in every role, unless declared', () => {
    // download_export is one definition for all three roles now (shared/data/download-export.js),
    // saveToFile included, so nothing is declared.
    const DECLARED = {};
    const byName = new Map();
    for (const role of ROLES) {
      for (const tool of role.tools) {
        if (DECLARED[tool.name]?.includes(role.name)) continue;
        if (!byName.has(tool.name)) byName.set(tool.name, []);
        byName.get(tool.name).push({ role: role.name, annotations: tool.annotations });
      }
    }
    for (const [name, entries] of byName) {
      for (const other of entries.slice(1)) {
        assert.deepEqual(other.annotations, entries[0].annotations,
          `${name}: annotated differently for ${entries[0].role} and ${other.role}`);
      }
    }
  });
});
