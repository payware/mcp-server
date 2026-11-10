import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { QR_OPTION_PROPERTIES, BARCODE_OPTION_PROPERTIES, buildQrOptions, buildBarOptions } from '../../shared/media-options.js';
import { CREATES } from '../../shared/tool-annotations.js';
import { checkDeferredAllowed, deferredAllowedOption, DEFERRED_ALLOWED_DESCRIPTION } from '../../shared/deferred-transfer.js';

/**
 * Create a transaction via payware API
 * @param {Object} params - Transaction parameters
 * @returns {Object} Transaction response
 */
export async function createTransaction({
  type = 'PLAIN',
  amount,
  currency = 'EUR',
  reasonL1,
  reasonL2,
  callbackUrl,
  account,
  friendlyName,
  shop,
  timeToLive = 120,
  // Opt-in to a deferred Merchant Leg (trOptions.deferredAllowed, server docs/execution-lock.md).
  deferredAllowed,
  partnerId,
  privateKey,
  passbackParams,
  // POS terminal producer attribution. Optional, and independent of everything else on the request:
  // it selects a revenue share out of payware's own fee and never changes what the merchant pays.
  producerPartnerId,
  terminalId,
  terminalManufacturer,
  // QR Options
  qrFormat,
  qrBorder,
  qrErrorCorrection,
  qrScale,
  qrVersion,
  // Barcode Options
  barFormat,
  barModuleWidth,
  barBarHeight,
  barFontSize,
  barHumanReadableLocation,
  idempotencyKey,
  useSandbox = true
}) {
  if (!reasonL1) {
    throw new Error('reasonL1 is required (transaction grounds description)');
  }
  
  if (amount !== undefined && (typeof amount !== 'string' && typeof amount !== 'number')) {
    throw new Error('Amount must be a string or number representing currency value (e.g., "25.50" or 25.50)');
  }
  
  if (amount !== undefined && parseFloat(amount) < 0) {
    throw new Error('Amount must be non-negative');
  }
  
  if (!['PLAIN', 'QR', 'BARCODE'].includes(type)) {
    throw new Error('Transaction type must be PLAIN, QR, or BARCODE');
  }
  
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Refuse an empty producerPartnerId here rather than letting it reach the server.
  // The server rejects an unrecognised producer id outright - a misconfigured terminal fails on its
  // first sale, deliberately, so that an installer sees it - and an empty string is unrecognised.
  // Sending one turns "no producer arrangement" into a failed transaction, when the correct way to
  // say that is to omit the field entirely.
  if (producerPartnerId !== undefined && String(producerPartnerId).trim() === '') {
    throw new Error(
      'producerPartnerId must not be empty. Omit the field entirely when there is no POS terminal ' +
      'producer arrangement - an unrecognised value (including an empty string) is rejected by the ' +
      'server and fails the transaction.'
    );
  }

  // A terminal sale stays instant or internal: the server answers 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED
  // to an opt-in that carries producer or terminal fields. Said here, naming the fields, rather than
  // after a round trip.
  checkDeferredAllowed(deferredAllowed, { producerPartnerId, terminalId, terminalManufacturer });

  for (const [field, value] of [['terminalId', terminalId], ['terminalManufacturer', terminalManufacturer]]) {
    if (value === undefined || value === null) continue;
    if (String(value).length > 64) {
      throw new Error(`${field} cannot exceed 64 characters`);
    }
    // The server rejects control characters in both fields; catching it here names the field.
    if (/[\u0000-\u001F\u007F]/.test(String(value))) {
      throw new Error(`${field} must not contain control characters`);
    }
  }

  const qrOptions = buildQrOptions(type, { qrFormat, qrBorder, qrErrorCorrection, qrScale, qrVersion });
  
  const barOptions = buildBarOptions(type, { barFormat, barModuleWidth, barBarHeight, barFontSize, barHumanReadableLocation });
  
  // Build request body according to documentation structure
  const requestBody = {
    ...(account && { account }),
    ...(friendlyName && { friendlyName }),
    ...(shop && { shop }),
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && {
      passbackParams: typeof passbackParams === 'string' ? passbackParams : JSON.stringify(passbackParams)
    }),
    ...(producerPartnerId && { producerPartnerId }),
    ...(terminalId && { terminalId }),
    ...(terminalManufacturer && { terminalManufacturer }),
    trData: {
      amount: amount !== undefined ? amount.toString() : '0.00',
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    trOptions: {
      type,
      timeToLive,
      ...deferredAllowedOption(deferredAllowed)
    },
    ...(qrOptions && { qrOptions }),
    ...(barOptions && { barOptions })
  };
  
  // Convert to deterministic minimized JSON as required by payware API for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (POST requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);
  
  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1', // Required: current API version
    ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
  };
  
  try {
    
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    // This ensures the server calculates the same SHA-256 hash
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.post(`${baseUrl}/transactions`, minimizedBodyString, {
      headers,
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });
    
    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-correlation-id'],
      replayed: response.headers?.['idempotent-replayed'] === 'true',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Provide helpful error message for hash mismatches
    let enhancedMessage = error.response?.data?.message || error.message;

    if (error.response?.data?.errorCode === 'ERR_INVALID_CONTENT_HASH' ||
        enhancedMessage?.includes('SHA-256') ||
        enhancedMessage?.includes('contentSha256')) {
      enhancedMessage = `Hash Mismatch Error: The contentSha256 in JWT header doesn't match the request body.

Cause: Different JSON strings were used for JWT contentSha256 calculation and HTTP body.
Solution: Ensure the EXACT same compact JSON string is used for both purposes.

Original error: ${enhancedMessage}`;
    }

    return {
      success: false,
      error: {
        message: enhancedMessage,
        status: error.response?.status,
        code: error.response?.data?.errorCode,
        details: error.response?.data,
        helpUrl: error.response?.data?.errorCode === 'ERR_INVALID_CONTENT_HASH' ?
          'https://github.com/payware/mcp-server#sha256-consistency' : undefined
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Create transaction tool implementation
 */
export const createTransactionTool = {
  name: "payware_operations_create_transaction",
  annotations: CREATES,
  description: `Create a new payware transaction. Parameters map to the following API structure:

📋 **ROOT LEVEL** (Transaction metadata):
- shop, account, friendlyName, callbackUrl, passbackParams
- producerPartnerId, terminalId, terminalManufacturer (POS terminal producer attribution - see below)

💰 **TRANSACTION DATA** (trData object):
- amount, currency, reasonL1, reasonL2

⚙️ **TRANSACTION OPTIONS** (trOptions object):
- type, timeToLive, deferredAllowed (deferred Merchant Leg opt-in - see below)

📱 **QR OPTIONS** (qrOptions object - only when type=QR):
- qrFormat, qrBorder, qrErrorCorrection, qrScale, qrVersion

🔗 **BARCODE OPTIONS** (barOptions object - only when type=BARCODE):
- barFormat, barModuleWidth, barBarHeight, barFontSize, barHumanReadableLocation

🔐 **AUTHENTICATION** (not sent to API, used for JWT signing):
- partnerId, privateKey

**Actual API Request Structure:**
\`\`\`json
{
  "shop": "...",
  "account": "...",
  "friendlyName": "...",
  "callbackUrl": "...",
  "passbackParams": "...",
  "trData": {
    "amount": "25.50",
    "currency": "EUR", 
    "reasonL1": "...",
    "reasonL2": "..."
  },
  "trOptions": {
    "type": "QR",
    "timeToLive": 300
  },
  "qrOptions": { ... }
}
\`\`\`

⏳ **DEFERRED MERCHANT LEG** (optional, \`trOptions.deferredAllowed\`)

By default the payer's institution pays this transaction with an instant or an internal transfer.
\`deferredAllowed: true\` also lets it use an ordinary credit transfer that settles later. Rules:

- Honoured only on your own call without POS terminal producer fields. With \`producerPartnerId\`,
  \`terminalId\` or \`terminalManufacturer\` the transaction is refused with 400
  \`ERR_DEFERRED_TRANSFER_NOT_ALLOWED\`: a till payment stays instant or internal.
- **A deferred payment stays ACTIVE, i.e. pending, until the transfer settles, which can take days**,
  and so can stay ACTIVE past its \`timeToLive\`. Keep polling or wait for the callback; never treat
  it as expired yourself. CONFIRMED arrives once the money has reached your account.
- Echoed as \`deferredAllowed: true\` in the create response and on status reads when set; absent
  otherwise. Leave it out for instant or internal only.

🏭 **POS TERMINAL PRODUCER ATTRIBUTION** (optional, root level)

Only relevant if the transaction originates on a POS terminal whose producer has a revenue-share
agreement with payware. Three fields, all optional:

- \`producerPartnerId\` - the 8-character partnerId payware issued to the terminal producer.
  **An unrecognised value fails the transaction with a 400** (\`ERR_INVALID_PRODUCER_ID\`) - it is
  deliberately not ignored, so that a terminal configured with the wrong id fails on its first sale
  where an installer can see it. **Omit the field entirely when there is no producer arrangement;
  never send an empty string.**
- \`terminalId\` - the producer's own identifier for the physical terminal. Max 64 chars, no control
  characters. payware records it and never interprets it: no format, no uniqueness enforcement, and
  nothing about pricing or attribution depends on it.
- \`terminalManufacturer\` - device manufacturer as the terminal reports it. Max 64 chars, no control
  characters. Recorded for provenance. payware's internal attribution review counts each producer's
  sales by reported manufacturer, so a build running on another vendor's hardware stands out; it is
  never blocked.

Two things worth knowing:
1. **It never changes what the merchant is charged.** The producer's share comes out of payware's own
   fee, not out of a higher price for the merchant, whose fee always follows the fee hierarchy.
2. **None of the three is returned.** They do not appear in the create response, in \`get_transaction_status\`,
   in transaction history, or in any callback. What a producer earned is visible on their own
   dashboard and settlements - attribution is recorded against the fee, not against the transaction.

If an ISV's software made the call, the ISV is attributed and the producer is not, even when the
ISV's software is running on that producer's hardware.`,
  inputSchema: {
    type: "object",
    properties: {
      idempotencyKey: {
        type: "string",
        description: "Optional. Sent as the Idempotency-Key header. Use one value per payment (a UUID is typical) and the same value on every retry of it: a retry with the same key and body within 24 hours returns the transaction the first call created instead of a new one, and the result reports replayed: true. The same key with a different body is refused (422 ERR_IDEMPOTENCY_KEY_REUSED); a retry while the first call still runs gets 409 ERR_IDEMPOTENCY_KEY_IN_PROGRESS.",
        pattern: "^[\\x21-\\x7E]{1,255}$"
      },
      type: {
        type: "string",
        enum: ["PLAIN", "QR", "BARCODE"],
        description: "Transaction type"
      },
      amount: {
        type: "number", 
        description: "Amount as currency value (e.g., 25.50 for €25.50 or '15.75' for $15.75). Can be 0 for amount-flexible transactions. Max 36 chars including decimals",
        minimum: 0,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code)"
      },
      reasonL1: {
        type: "string",
        description: "Transaction grounds description (required)",
        maxLength: 100
      },
      reasonL2: {
        type: "string", 
        description: "Transaction grounds description continuation (optional)",
        maxLength: 100
      },
      account: {
        type: "string",
        description: "📋 ROOT LEVEL: Account identifier (if not supplied, determined from payware portal)",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "📋 ROOT LEVEL: Account holder recognizable name (if not supplied, merchant alias is used)",
        maxLength: 100
      },
      shop: {
        type: "string",
        description: "📋 ROOT LEVEL: Shop code (if not supplied, default shop is used)", 
        maxLength: 10
      },
      timeToLive: {
        type: "number",
        description: "⚙️ TRANSACTION OPTIONS: Time allowed for payment initiation in seconds. Once the payer's institution has started the payment, the transaction stays ACTIVE past it until the money has moved (seconds for an instant transfer, days with deferredAllowed); never infer EXPIRED from the clock.",
        minimum: 60,
        maximum: 600
      },
      deferredAllowed: {
        type: "boolean",
        description: `⚙️ TRANSACTION OPTIONS: ${DEFERRED_ALLOWED_DESCRIPTION}`
      },
      callbackUrl: {
        type: "string",
        description: "📋 ROOT LEVEL: HTTPS URL to receive transaction status callbacks. Must be https://, must present a publicly-trusted TLS certificate, and must resolve to a public address - internal/private addresses are rejected (ERR_UNRESOLVABLE_CALLBACK_URL).",
        format: "uri"
      },
      producerPartnerId: {
        type: "string",
        description: "🏭 ROOT LEVEL: partnerId of the POS terminal producer whose terminal produced this transaction. Must be a partner registered with payware and flagged as a producer - an unrecognised value REJECTS the transaction (400 ERR_INVALID_PRODUCER_ID) rather than being ignored. Omit entirely when there is no producer arrangement; never send an empty string. Selects the producer's revenue share out of payware's own fee and never changes what the merchant is charged. Not returned in any response or callback."
      },
      terminalId: {
        type: "string",
        description: "🏭 ROOT LEVEL: Opaque identifier of the physical terminal, scoped to the producer's own estate. payware assumes no format and enforces no uniqueness; it is recorded for provenance and never affects attribution or pricing. Make it unique within your own estate anyway - that is what lets you answer 'which terminal produced this sale' later. Not returned in any response or callback.",
        maxLength: 64
      },
      terminalManufacturer: {
        type: "string",
        description: "🏭 ROOT LEVEL: Device manufacturer as reported by the terminal. Recorded for provenance; a mismatch against the expected producer is surfaced in settlement review and never blocks the transaction. Not returned in any response or callback.",
        maxLength: 64
      },
      partnerId: {
        type: "string",
        description: "🔐 AUTHENTICATION: Partner ID from payware dashboard (not sent in API request). Uses PAYWARE_PARTNER_ID env var as default."
      },
      privateKey: {
        type: "string",
        description: "🔐 AUTHENTICATION: RSA private key for JWT token creation (not sent in API request). Accepts PEM format with/without headers or raw base64 content. Uses environment-specific private key as default."
      },
      passbackParams: {
        type: "string",
        description: "📋 ROOT LEVEL: Additional parameters passed back in callbacks (max 200 chars)",
        maxLength: 200
      },
      // QR and barcode options: one definition for every create tool (shared/media-options.js)
      ...QR_OPTION_PROPERTIES,
      ...BARCODE_OPTION_PROPERTIES,
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing"
      }
    },
    required: ["currency", "reasonL1"],
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      type = 'PLAIN',
      amount,
      currency = 'EUR',
      reasonL1,
      reasonL2,
      callbackUrl,
      account,
      friendlyName,
      shop,
      timeToLive = 120,
      deferredAllowed,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      passbackParams,
      // POS terminal producer attribution
      producerPartnerId,
      terminalId,
      terminalManufacturer,
      // QR Options
      qrFormat,
      qrBorder,
      qrErrorCorrection,
      qrScale,
      qrVersion,
      // Barcode Options
      barFormat,
      barModuleWidth,
      barBarHeight,
      barFontSize,
      barHumanReadableLocation,
      idempotencyKey,
      useSandbox = true
    } = args;
    
    if (!reasonL1) {
      throw new Error("reasonL1 is required (transaction grounds description)");
    }
    
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }
    
    const result = await createTransaction({
      type,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      account,
      friendlyName,
      shop,
      timeToLive,
      deferredAllowed,
      partnerId,
      privateKey,
      passbackParams,
      producerPartnerId,
      terminalId,
      terminalManufacturer,
      // QR Options
      qrFormat,
      qrBorder,
      qrErrorCorrection,
      qrScale,
      qrVersion,
      // Barcode Options
      barFormat,
      barModuleWidth,
      barBarHeight,
      barFontSize,
      barHumanReadableLocation,
      idempotencyKey,
      useSandbox
    });
    
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

    if (result.success) {
      // New transactions are always ACTIVE when created
      const status = result.transaction.status || 'ACTIVE';
      const statusEmoji = '⏳';

      return {
        content: [{
          type: "text",
          text: `💳 **Transaction Created Successfully**

**Transaction Details:**
- ID: ${result.transaction.transactionId || 'N/A'}
- Type: ${type}
- Status: ${statusEmoji} ${status}
- Amount: ${amount} ${currency}
- Description: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}
${result.transaction.deferredAllowed === true ? '- Deferred Merchant Leg allowed: yes - the payment may stay ACTIVE until the transfer settles, which can take days' : ''}

**API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions
- Response Status: ${result.transaction ? 'Success' : 'Failed'}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
1. Save the transaction ID: \`${result.transaction.transactionId || 'N/A'}\`
2. Use \`payware_operations_get_transaction_status\` to check status
3. Wait for callback notification (if callback URL provided)
4. Process payment through payware interface`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Creation Failed**

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions
- Headers: Api-Version=1, Content-Type=application/json

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Troubleshooting:**
1. Verify JWT token is valid and not expired
2. Check transaction parameters (amount, type, currency)
3. Ensure private key matches public key registered with payware
4. Verify partner ID and API access
5. Check sandbox API status`
        }]
      };
    }
  }
};