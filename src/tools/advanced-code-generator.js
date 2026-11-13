/**
 * Code examples for the payware API: payware_generate_code_example and payware_generate_documentation.
 *
 * Every operation below is a route the server has, with the body its controller reads (verified against
 * server/ TransactionController, TransactionHistoryController, ApiProductController, AudioController,
 * Oauth2Controller and ReportApiController, and the FI and merchant validation services, 2026-11-10).
 * src/tools/code-example-languages.js turns one into a complete program in Python, Node.js, PHP, Java,
 * C# or curl, signed as the server's JWT filter expects. An ISV's call is made on behalf of a merchant,
 * except the /oauth2 endpoints, which the ISV signs for itself.
 */

import { LOCAL } from '../shared/tool-annotations.js';
import { LANGUAGES, renderRequest, renderAuthentication } from './code-example-languages.js';

const ALL = ['merchant', 'isv', 'payment_institution'];
const MERCHANT_AND_ISV = ['merchant', 'isv'];

const TRANSACTION = { transactionId: 'pw7e4rCToG' };
const PRODUCT = { productId: 'pr7e4rCToG' };
const AUDIO = { productId: 'pr7e4rCToG', audioId: '7' };
const TOKEN = { token: 'kTnR5wQ2vYb8sLcH' };
const REPORT_REQUEST = { requestId: '1a81220c-2e38-4759-b067-c81abf176295' };

/**
 * The payer institution's process body: no account (payware does not keep the payer's; FIValidationService
 * requires one only from the payee), and the currency and reasonL1 an institution must send.
 */
const INSTITUTION_PROCESS_BODY = {
  friendlyName: 'Jane Doe',
  trData: {
    amount: '112.00',
    currency: 'EUR',
    reasonL1: 'Payment'
  }
};

/**
 * The institution flow of the execution lock (server docs/execution-lock.md, kb
 * tech/financial-institution/api, Finalize Transaction). `description` goes into the generated code as
 * a comment; `notes` is prose for the page around the code.
 */
const FINALIZE_STEPS = [
  {
    name: 'process_transaction',
    title: 'Step 1 - process the transaction',
    description: 'Process the transaction as the payer institution',
    method: 'POST',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    body: INSTITUTION_PROCESS_BODY,
    notes: 'The response carries `fee` (the Fee Leg, payware\'s fee plus VAT), `feeVat`, `feeAccount` (payware\'s fee account with your institution) and, only when the merchant allowed a deferred transfer, `deferredAllowed: true`. Present both payees and the total `amount` to the payer, take one strong customer authentication for both transfers, and reserve the amount.'
  },
  {
    name: 'send_executing',
    title: 'Step 2 - EXECUTING, immediately before money moves',
    description: 'Lock the transaction with EXECUTING before money moves',
    method: 'PATCH',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    body: {
      status: 'EXECUTING',
      amount: '112.00',
      currency: 'EUR',
      fee: '1.34',
      transferType: 'INSTANT'
    },
    notes: 'Send it within 5 seconds of the payer\'s approval. Echo `amount`, `currency` and `fee` from the process response unchanged (never recompute or re-round `fee`: `ERR_FEE_MISMATCH`), and name the `transferType`: `INSTANT`, `INTERNAL`, or `DEFERRED` only when the process response carried `deferredAllowed: true`. payware runs every check now and locks the transaction: it no longer expires, and payware will not refuse its `CONFIRMED` or `FAILED` for reasons of its own. **If payware refuses, move no money and release the reservation.** Repeating the identical `EXECUTING` after a timeout is answered with the stored result. Then execute the Merchant Leg (`amount` minus `fee`, to the payee, the transaction ID as remittance information); for `DEFERRED`, send the Fee Leg (`fee`, to `feeAccount`) together with it.'
  },
  {
    name: 'send_confirmed',
    title: 'Step 3 - CONFIRMED, once the Merchant Leg has completed',
    description: 'Report CONFIRMED once the Merchant Leg has completed',
    method: 'PATCH',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    body: {
      status: 'CONFIRMED'
    },
    notes: 'Send it only once the Merchant Leg has completed: `INSTANT`, on the receiving bank\'s confirmation of completion; `INTERNAL`, when the merchant\'s account is credited; `DEFERRED`, when the transfer has settled to the merchant\'s account. A payer waiting at a till should not wait more than 15 seconds for it. After `EXECUTING` the status alone is enough; an `amount`, `currency`, `fee` or `transferType` you repeat must equal the lock (`ERR_EXECUTION_MISMATCH`). For `INSTANT` and `INTERNAL`, execute the Fee Leg after payware has accepted `CONFIRMED`. `CONFIRMED` without a prior `EXECUTING` is refused with `409 ERR_NOT_EXECUTING`. A lock left open is flagged to payware support after 60 seconds (`INSTANT`, `INTERNAL`) or two TARGET2 business days (`DEFERRED`), and payware then asks you for the outcome: it never closes a lock itself.'
  },
  {
    name: 'send_failed',
    title: 'Or step 3 - FAILED, if the Merchant Leg was rejected',
    description: 'Report FAILED when the Merchant Leg was rejected',
    method: 'PATCH',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    body: {
      status: 'FAILED',
      statusMessage: 'Merchant Leg rejected'
    },
    notes: 'Send it instead of `CONFIRMED`. The Fee Leg is executed only after `CONFIRMED`, whatever the transfer type, so it was never executed: do not execute it. After a `DEFERRED` lock, release the Fee Amount you kept reserved. `feeLegOutcome` is optional and only `NOT_EXECUTED` is accepted.'
  }
];

/**
 * Every operation. `base` is 'api' unless noted: 'host' for /oauth2 (served outside /api), 'production'
 * for data retrieval (sandbox lists no reports and runs none, ReportApiController).
 */
const OPERATIONS = {
  create_transaction: {
    description: 'Create a payment transaction',
    method: 'POST',
    path: '/transactions',
    partnerTypes: ALL,
    body: {
      trData: { amount: '25.50', currency: 'EUR', reasonL1: 'Payment for services', reasonL2: 'Invoice 12345' },
      trOptions: { type: 'QR', timeToLive: 120 }
    },
    byPartner: {
      // FIValidationService.validateGenerateTransactionRequest: role, friendlyName, and an account only as
      // the payee (DST).
      payment_institution: {
        description: 'Create a transaction as the payer institution (role SRC)',
        body: {
          role: 'SRC',
          friendlyName: 'Jane Doe',
          trData: { amount: '25.50', currency: 'EUR', reasonL1: 'Payment' },
          trOptions: { type: 'QR', timeToLive: 300 }
        }
      }
    }
  },
  get_transaction_status: {
    description: 'Get a pending transaction',
    method: 'GET',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    partnerTypes: ALL
  },
  process_transaction: {
    description: 'Process a transaction',
    method: 'POST',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    partnerTypes: ALL,
    body: { trData: { amount: '25.50', currency: 'EUR', reasonL1: 'Payment' } },
    byPartner: {
      payment_institution: { description: 'Process a transaction as the payer institution', body: INSTITUTION_PROCESS_BODY }
    }
  },
  cancel_transaction: {
    description: 'Cancel a transaction you created, before it is processed',
    method: 'PATCH',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    partnerTypes: ALL,
    body: { status: 'CANCELLED', statusMessage: 'Cancelled by the customer' }
  },
  // The institution's finalize (server docs/execution-lock.md): one route, PATCH /transactions/{id}, sent
  // twice around the money movement. The example is the whole flow, so it carries its steps.
  finalize_transaction: {
    description: 'Finalize a transaction as the payer\'s institution: EXECUTING before money moves, then CONFIRMED or FAILED',
    method: 'PATCH',
    path: '/transactions/{transactionId}',
    params: TRANSACTION,
    partnerTypes: ['payment_institution'],
    steps: FINALIZE_STEPS
  },
  get_transaction_history: {
    description: 'Get a transaction in a final status',
    method: 'GET',
    path: '/transactions-history/{transactionId}',
    params: TRANSACTION,
    partnerTypes: ALL
  },

  create_product: {
    description: 'Create a product',
    method: 'POST',
    path: '/products',
    partnerTypes: MERCHANT_AND_ISV,
    // ProductRequest: the flags are the strings TRUE and FALSE, and a product is created inactive unless
    // active is TRUE. ProductData.timeToLive is a string of seconds.
    body: {
      name: 'Premium Service',
      shortDescription: 'A one-hour consultation',
      active: 'TRUE',
      prData: { type: 'ITEM', regularPrice: '49.99', currency: 'EUR', timeToLive: '86400' },
      prOptions: { imageUrl: 'https://example.com/product.png' }
    }
  },
  get_product: {
    description: 'Get a product',
    method: 'GET',
    path: '/products/{productId}',
    params: PRODUCT,
    partnerTypes: MERCHANT_AND_ISV
  },
  list_products: {
    description: 'List the products',
    method: 'GET',
    path: '/products',
    partnerTypes: MERCHANT_AND_ISV
  },
  update_product: {
    description: 'Update a product',
    method: 'PATCH',
    path: '/products/{productId}',
    params: PRODUCT,
    partnerTypes: MERCHANT_AND_ISV,
    // Only what changes: payware keeps every stored value the request leaves out, the active period
    // included when neither date is sent (server ProductService.update, 2026-11-11).
    body: {
      name: 'Premium Service',
      prData: { regularPrice: '69.99' }
    }
  },
  delete_product: {
    description: 'Delete a product',
    method: 'DELETE',
    path: '/products/{productId}',
    params: PRODUCT,
    partnerTypes: MERCHANT_AND_ISV
  },
  register_audio: {
    description: 'Upload a soundbite audio file for a product',
    method: 'POST',
    path: '/products/{productId}/audios/upload',
    params: PRODUCT,
    partnerTypes: MERCHANT_AND_ISV,
    // AudioController: multipart/form-data with one part, file. A multipart upload carries no content hash.
    multipart: { field: 'file', param: 'audioPath', sample: 'jingle.mp3' }
  },
  get_audios: {
    description: 'List the audio files of a product',
    method: 'GET',
    path: '/products/{productId}/audios',
    params: PRODUCT,
    partnerTypes: MERCHANT_AND_ISV
  },
  get_audio: {
    description: 'Get an audio file of a product',
    method: 'GET',
    path: '/products/{productId}/audios/{audioId}',
    params: AUDIO,
    partnerTypes: MERCHANT_AND_ISV
  },
  update_audio: {
    description: 'Rename an audio file',
    method: 'PATCH',
    path: '/products/{productId}/audios/{audioId}',
    params: AUDIO,
    partnerTypes: MERCHANT_AND_ISV,
    // Moving an audio to another product is POST .../{audioId}/transfer, not this.
    body: { title: 'Jingle' }
  },
  delete_audio: {
    description: 'Delete an audio file',
    method: 'DELETE',
    path: '/products/{productId}/audios/{audioId}',
    params: AUDIO,
    partnerTypes: MERCHANT_AND_ISV
  },

  obtain_token: {
    description: 'Request an OAuth2 token for a merchant, PENDING until the merchant grants it',
    method: 'POST',
    path: '/oauth2/tokens',
    base: 'host',
    partnerTypes: ['isv'],
    // Oauth2RequestToken: clientId is the merchant's partner id, clientSecret the Base64 pairing key it gave you.
    body: { grantType: 'client_credentials', clientId: 'PZAYNMVE', clientSecret: 'YVlQMkxOdXQ0Y2RDQUdaYk5GQVA3VkpqMmxlQ0x1Z20=' }
  },
  get_token_info: {
    description: 'Get the status of an OAuth2 token',
    method: 'GET',
    path: '/oauth2/tokens/{token}',
    params: TOKEN,
    base: 'host',
    partnerTypes: ['isv']
  },
  rotate_token: {
    description: 'Rotate an OAuth2 token, keeping the merchant authorization it was granted under',
    method: 'POST',
    path: '/oauth2/tokens/{token}/rotate',
    params: TOKEN,
    base: 'host',
    partnerTypes: ['isv']
  },

  list_reports: {
    description: 'List the reports you may run',
    method: 'GET',
    path: '/data-retrieval/reports',
    base: 'production',
    partnerTypes: ALL
  },
  generate_report: {
    description: 'Run a report',
    method: 'POST',
    path: '/data-retrieval',
    base: 'production',
    partnerTypes: ALL,
    // DataRetrievalRequest: reportUnitId is the bare id (^[A-Za-z0-9_-]{1,64}$), the last segment of a
    // path list_reports returns; dates as yyyy-MM-dd.
    body: { reportUnitId: 'processedTransactions', dateFrom: '2026-10-01', dateTo: '2026-10-31', timeZone: 'Europe/Sofia' }
  },
  get_report_status: {
    description: 'Get the status of a report request',
    method: 'GET',
    path: '/data-retrieval/request/{requestId}/status',
    params: REPORT_REQUEST,
    base: 'production',
    partnerTypes: ALL
  },
  export_report: {
    description: 'Export a finished report',
    method: 'POST',
    path: '/data-retrieval/request/{requestId}/export/{outputFormat}',
    // ReportOutputFormat: pdf, xls, xlsx, rtf, csv, html, xml, docx, odt, ods.
    params: { ...REPORT_REQUEST, outputFormat: 'pdf' },
    base: 'production',
    partnerTypes: ALL
  },

  authentication: {
    description: 'JWT authentication',
    partnerTypes: ALL
  }
};

const CATEGORY = {
  authentication: 'authentication',
  obtain_token: 'oauth2', get_token_info: 'oauth2', rotate_token: 'oauth2',
  list_reports: 'reports', generate_report: 'reports', get_report_status: 'reports', export_report: 'reports',
  register_audio: 'audio', get_audios: 'audio', get_audio: 'audio', update_audio: 'audio', delete_audio: 'audio'
};
const categoryOf = operation => CATEGORY[operation] ?? (operation.includes('product') ? 'products' : 'transactions');

/** The route as an integrator reads it: /oauth2 at the host root, everything else under /api. */
const routeOf = def => `${def.method} ${def.base === 'host' ? '' : '/api'}${def.path}`;

const FENCE = { nodejs: 'javascript', curl: 'bash' };
const fenceOf = language => FENCE[language] ?? language;

class CodeExampleGenerator {
  constructor() {
    this.supportedLanguages = LANGUAGES;
    this.partnerTypes = ALL;
    this.operationDefinitions = OPERATIONS;
  }

  /** An operation's definition for one partner type, with what differs for it applied over it. */
  definitionFor(operation, partnerType) {
    const { byPartner, ...def } = this.operationDefinitions[operation];
    const merged = { name: operation, base: 'api', params: {}, body: null, ...def, ...(byPartner?.[partnerType] ?? {}) };
    // An ISV acts for a merchant everywhere except /oauth2, where it signs for itself.
    merged.onBehalf = partnerType === 'isv' && merged.base !== 'host';
    return merged;
  }

  validate(operation, language, partnerType) {
    if (!this.supportedLanguages.includes(language)) {
      throw new Error(`Unsupported language: ${language}. Supported: ${this.supportedLanguages.join(', ')}`);
    }
    if (!this.partnerTypes.includes(partnerType)) {
      throw new Error(`Unsupported partner type: ${partnerType}. Supported: ${this.partnerTypes.join(', ')}`);
    }
    const def = this.operationDefinitions[operation];
    if (!def) {
      throw new Error(`Unknown operation: ${operation}`);
    }
    if (!def.partnerTypes.includes(partnerType)) {
      throw new Error(`Operation '${operation}' is not available for partner type '${partnerType}'. Available for: ${def.partnerTypes.join(', ')}`);
    }
  }

  generateExample(operation, language = 'python', partnerType = 'merchant', options = {}) {
    const opts = { includeComments: options.includeComments !== false, includeErrorHandling: options.includeErrorHandling !== false };
    this.validate(operation, language, partnerType);

    if (operation === 'authentication') {
      const code = renderAuthentication(language, partnerType, opts);
      return opts.includeComments
        ? `# JWT authentication - ${language} (${partnerType})\n\n${this.authenticationNotes(partnerType)}\n\n\`\`\`${fenceOf(language)}\n${code}\n\`\`\`\n`
        : code;
    }

    const def = this.definitionFor(operation, partnerType);
    if (def.steps) {
      return this.generateFlow(def, language, partnerType, opts);
    }

    const code = renderRequest(language, def, partnerType, opts);
    if (!opts.includeComments) return code;
    return `# ${def.description} - ${language} (${partnerType})

\`${routeOf(def)}\`

${this.notesFor(def, partnerType)}

\`\`\`${fenceOf(language)}
${code}
\`\`\`
`;
  }

  /** What a reader needs to know about one request beyond its code. */
  notesFor(def, partnerType) {
    const notes = [];
    if (def.onBehalf) {
      notes.push('Made on behalf of a merchant: the JWT\'s `aud` is the merchant\'s partner id and its `sub` the merchant\'s OAuth2 token (`PAYWARE_MERCHANT_PARTNER_ID`, `PAYWARE_OAUTH2_TOKEN`). The merchant\'s plan governs the call.');
    } else if (partnerType === 'isv') {
      notes.push('Signed by the ISV for itself: `aud` is `https://payware.eu`, and /oauth2 is served at the host root, not under /api.');
    }
    if (def.base === 'production') {
      notes.push('Data retrieval runs on production only: sandbox lists no reports and runs none.');
    }
    if (def.name === 'update_product') {
      notes.push('Send only what changes: payware keeps every stored value the request leaves out. Sending neither activeFrom nor activeTo keeps the active period; a start before today is refused.');
    }
    if (def.name === 'generate_report') {
      notes.push('`reportUnitId` is the bare report id: the last segment of a `path` from list_reports.');
    }
    if (def.multipart) {
      notes.push('A multipart upload carries no `contentSha256`.');
    } else if (def.body) {
      notes.push('The JWT header carries `contentSha256`, the Base64 SHA-256 of the exact body sent, so the body is serialized once and the same string is hashed and sent.');
    }
    return notes.join(' ');
  }

  authenticationNotes(partnerType) {
    return [
      'Every request is signed with an RS256 JWT, new for each request: `iat` must be within the last five minutes. The header is `{"alg":"RS256","typ":"JWT"}`, plus `contentSha256` (the standard Base64 of the SHA-256 of the exact body bytes sent) on a request with a body; a multipart upload carries none. The claims are `iss` (your partner id), `aud` and `iat`. Send it as `Authorization: Bearer <jwt>`, with `Api-Version: 1`.',
      partnerType === 'isv'
        ? 'As an ISV, a call for a merchant has `aud` set to the merchant\'s partner id and `sub` to the merchant\'s OAuth2 token; the /oauth2 endpoints are signed with `aud` `https://payware.eu`.'
        : '`aud` is always `https://payware.eu`.'
    ].join('\n\n');
  }

  /** A flow of several requests: each step as its own program, in order, with its notes between them. */
  generateFlow(def, language, partnerType, opts) {
    const blocks = def.steps.map(step => ({
      step,
      code: renderRequest(language, { base: 'api', params: {}, body: null, onBehalf: false, ...step }, partnerType, opts)
    }));

    if (!opts.includeComments) {
      // Each step is a program of its own; say where one ends and the next begins.
      return blocks.map(({ step, code }) => this.markFlowStep(code, `${step.title} - a separate program`, language)).join('\n\n');
    }

    return `# ${def.description} - ${language} (${partnerType})

The payer's institution reports each step of the payment on the same route, \`PATCH /api/transactions/{transactionId}\`, after processing it with \`POST /api/transactions/{transactionId}\`. payware gives its answer once, at \`EXECUTING\`, before any money moves, and never refuses a status after that. Only the payer's institution sees \`EXECUTING\`; the merchant sees the transaction as ACTIVE until \`CONFIRMED\` or \`FAILED\`, and \`EXECUTING\` sends no callback.

${blocks.map(({ step, code }) => `## ${step.title}

\`${routeOf({ base: 'api', ...step })}\`

${step.notes}

\`\`\`${fenceOf(language)}
${code}
\`\`\``).join('\n\n')}
`;
  }

  /** Put a one-line comment at the top of a flow step's code, after any line the language needs first. */
  markFlowStep(code, label, language) {
    const comment = ['python', 'curl'].includes(language) ? `# ${label}` : `// ${label}`;
    const firstLine = /^(<\?php|#!\/bin\/bash)\n/.exec(code);
    return firstLine
      ? `${firstLine[1]}\n${comment}\n${code.slice(firstLine[0].length)}`
      : `${comment}\n${code}`;
  }

  /** The operations a partner type has, by category, each with its route. */
  getAvailableOperations(partnerType) {
    const available = {};
    for (const operation of Object.keys(this.operationDefinitions)) {
      const def = this.operationDefinitions[operation];
      if (!def.partnerTypes.includes(partnerType)) continue;
      (available[categoryOf(operation)] ??= []).push(operation);
    }
    return available;
  }

  describeOperation(operation, partnerType) {
    if (operation === 'authentication') return 'authentication: the JWT helper';
    const def = this.definitionFor(operation, partnerType);
    return `${operation}: ${def.description} (\`${routeOf(def)}\`${def.steps ? ', then the two PATCH steps' : ''})`;
  }
}

export const advancedCodeGenerator = new CodeExampleGenerator();

const OPERATION_NAMES = Object.keys(OPERATIONS);

/**
 * Main code generation tool
 */
export const generateCodeExampleTool = {
  name: 'payware_generate_code_example',
  annotations: LOCAL,
  description: `Generate a complete program for one payware API call, or the JWT helper, in ${LANGUAGES.join(', ')}. Each program signs its request as payware requires (RS256 JWT with contentSha256 for a body, on behalf of a merchant for an ISV) and calls the real route. finalize_transaction (payment institutions) is the whole institution flow: process, EXECUTING immediately before money moves, then CONFIRMED once the Merchant Leg has completed, or FAILED.`,

  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: `The operation. Transactions: create_transaction, get_transaction_status, process_transaction, cancel_transaction, get_transaction_history, and for payment_institution finalize_transaction (process, EXECUTING, then CONFIRMED or FAILED, all on /api/transactions/{transactionId}). Products and audio (merchant, isv): create_product, get_product, list_products, update_product, delete_product, register_audio, get_audios, get_audio, update_audio, delete_audio. OAuth2 (isv): obtain_token, get_token_info, rotate_token. Reports (production only): list_reports, generate_report, get_report_status, export_report. authentication: the JWT helper on its own.`,
        enum: OPERATION_NAMES
      },
      language: {
        type: 'string',
        description: 'python (requests, PyJWT), nodejs (axios, jsonwebtoken), php (cURL, firebase/php-jwt), java (Java 11 HttpClient, no dependencies), csharp (.NET 6 HttpClient, no dependencies) or curl (curl and openssl). Default python.',
        enum: LANGUAGES
      },
      partner_type: {
        type: 'string',
        description: 'merchant, isv (calls on behalf of a merchant, and the OAuth2 token endpoints) or payment_institution. Decides which operations exist and how the JWT is signed. Default merchant.',
        enum: ALL
      },
      include_comments: {
        type: 'boolean',
        description: 'true (default): the program with comments, inside a page that names the route and what to know about it. false: the program alone.'
      },
      include_error_handling: {
        type: 'boolean',
        description: 'true (default): report a failed status or a network error. false: the shortest program.'
      }
    },
    required: ['operation'],
    additionalProperties: false
  },

  async handler(args) {
    const partnerType = args.partner_type || 'merchant';
    try {
      const result = advancedCodeGenerator.generateExample(args.operation, args.language || 'python', partnerType, {
        includeComments: args.include_comments !== false,
        includeErrorHandling: args.include_error_handling !== false
      });
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const available = Object.values(advancedCodeGenerator.getAvailableOperations(partnerType)).flat();
      return {
        content: [{
          type: 'text',
          text: `❌ Error generating code example: ${error.message}\n\nOperations for ${partnerType}: ${available.join(', ')}`
        }],
        isError: true
      };
    }
  }
};

/**
 * Documentation generation tool
 */
export const generateDocumentationTool = {
  name: 'payware_generate_documentation',
  annotations: LOCAL,
  description: 'An integration overview for one partner type: base URLs, how requests are signed, and every operation payware_generate_code_example can write, with its route.',

  inputSchema: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        description: `The language the overview's next steps refer to: ${LANGUAGES.join(', ')}. Default python.`,
        enum: LANGUAGES
      },
      partner_type: {
        type: 'string',
        description: 'merchant, isv or payment_institution. Decides the operations listed and how requests are signed. Default merchant.',
        enum: ALL
      }
    },
    additionalProperties: false
  },

  async handler(args) {
    const { language = 'python', partner_type: partnerType = 'merchant' } = args;
    const available = advancedCodeGenerator.getAvailableOperations(partnerType);
    const isv = partnerType === 'isv';
    const institution = partnerType === 'payment_institution';

    const text = `# payware integration overview - ${partnerType}

## Base URLs

| Environment | API | OAuth2 (ISV) |
|:-|:-|:-|
| Sandbox | \`https://sandbox.payware.eu/api\` | \`https://sandbox.payware.eu/oauth2\` |
| Production | \`https://api.payware.eu/api\` | \`https://api.payware.eu/oauth2\` |

Reports (data retrieval) run on production only: sandbox lists no reports and runs none.

## Signing a request

${advancedCodeGenerator.authenticationNotes(partnerType)}

The programs read \`PAYWARE_PARTNER_ID\` and \`PAYWARE_PRIVATE_KEY_PATH\` (your RSA private key as PKCS#8 PEM), and \`PAYWARE_BASE_URL\` when set${isv ? ', and for a call on behalf of a merchant `PAYWARE_MERCHANT_PARTNER_ID` and `PAYWARE_OAUTH2_TOKEN`' : ''}.
${isv ? `
## Acting for a merchant

Request a token with \`obtain_token\` (the merchant's partner id and the Base64 pairing key it gave you). It is PENDING until the merchant grants it; \`get_token_info\` shows its status, and \`rotate_token\` renews it before or after it expires without asking the merchant again. The merchant's plan governs every call you make for it.
` : ''}${institution ? `
## Finalizing as the payer's institution

Process the transaction, take the payer's approval and reserve the amount, then send \`EXECUTING\` immediately before money moves (within 5 seconds of the approval): payware checks everything once and locks the transaction, and a refusal means nothing moves. Execute the Merchant Leg, then send \`CONFIRMED\` once it has completed (a payer at a till should not wait more than 15 seconds), or \`FAILED\`. The Fee Leg follows \`CONFIRMED\` for \`INSTANT\` and \`INTERNAL\` and goes with the Merchant Leg for \`DEFERRED\`. A lock left open is flagged to payware support after 60 seconds (\`INSTANT\`, \`INTERNAL\`) or two TARGET2 business days (\`DEFERRED\`); payware asks you for the outcome and never closes it itself. \`finalize_transaction\` writes the whole flow.
` : ''}
## Operations

${Object.entries(available)
  .map(([category, ops]) => `### ${category}\n${ops.map(op => `- ${advancedCodeGenerator.describeOperation(op, partnerType)}`).join('\n')}`)
  .join('\n\n')}

## Next steps

1. \`payware_generate_code_example\` with \`operation: "authentication"\`, \`language: "${language}"\`, \`partner_type: "${partnerType}"\` for the JWT helper.
2. The same tool with any operation above for a complete program.
3. Try it on sandbox, then set \`PAYWARE_BASE_URL\` to production.
`;

    return { content: [{ type: 'text', text }] };
  }
};
