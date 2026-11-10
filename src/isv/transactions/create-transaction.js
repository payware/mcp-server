import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../../shared/api-errors.js';
import { QR_OPTION_PROPERTIES, BARCODE_OPTION_PROPERTIES, buildQrOptions, buildBarOptions } from '../../shared/media-options.js';
import { CREATES } from '../../shared/tool-annotations.js';
import { checkDeferredAllowed, deferredAllowedOption, DEFERRED_ALLOWED_DESCRIPTION } from '../../shared/deferred-transfer.js';

/**
 * Create a transaction via payware API on behalf of a merchant (ISV)
 * @param {Object} params - Transaction parameters including ISV authentication
 * @returns {Object} Transaction response
 */
export async function createTransaction({
  // ISV Authentication
  merchantPartnerId,
  oauth2Token,
  // Transaction parameters
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
  passbackParams,
  // Opt-in to a deferred Merchant Leg (trOptions.deferredAllowed, server docs/execution-lock.md).
  deferredAllowed,
  // Never sent by this tool (see the description). Read only so that an opt-in on a terminal sale is
  // refused as the server would refuse it.
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
  // ISV-specific validation
  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  // Standard validation
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

  // A terminal sale stays instant or internal: the server answers 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED.
  checkDeferredAllowed(deferredAllowed, { producerPartnerId, terminalId, terminalManufacturer });

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

  // Get ISV credentials
  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Create ISV JWT token
  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Use the same JSON serialization method as the JWT factory for SHA-256 calculation
  const { createMinimizedJSON } = await import('../../core/utils/json-serializer.js');
  const minimizedBodyString = createMinimizedJSON(requestBody);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const response = await axios.post(`${baseUrl}/transactions`, minimizedBodyString, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
      },
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });

    // A retry answered from the first call (Idempotency-Key) says so in a header, not in the body.
    return response.headers?.['idempotent-replayed'] === 'true'
      ? { ...response.data, replayed: true }
      : response.data;
  } catch (error) {
    throw describeApiError(error, 'call the payware API');
  }
}

export const createTransactionTool = {
  name: 'payware_operations_create_transaction',
  annotations: CREATES,
  description: `Create a new transaction through payware as an ISV on behalf of a merchant.

ISV partners can create transactions for merchants they have authorization for via OAuth2.
Requires valid OAuth2 token obtained from the merchant.

**Authentication**: Uses ISV JWT with merchant partner ID in 'aud' claim and OAuth2 token in 'sub' claim.

⚠️ **The MERCHANT's plan governs, not the ISV's.** An on-behalf call inherits the plan of the merchant
it acts for, so this endpoint answers **403** (\`ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN\`) when
that merchant is on **Basic**. Acting on behalf is no longer sufficient on its own - before
2026-08-21 it was, and an ISV serving a Basic merchant could reach the transaction, product, shop and
report APIs regardless of that merchant's plan. The same applies to
\`payware_products_*\` and \`payware_data_*\`. If a call that used to work
now returns 403, check the merchant's plan first.

⚠️ **Shop scope.** An ISV reaches only the shops the merchant assigned it. Naming any other shop
answers **403 ERR_SHOP_NOT_IN_SCOPE**, and \`payware_shops_list\` returns only the in-scope ones.
Omitting \`shop\` uses the merchant's default shop, which may itself be out of scope.

ℹ️ **Producer attribution does not apply here.** Whoever made the API call owns the sale, so an ISV
call is an ISV sale even when the ISV's software is running on a hardware producer's terminal, and the
producer earns nothing from it. This tool therefore does not send \`producerPartnerId\` /
\`terminalId\` / \`terminalManufacturer\`. The server does accept them on an ISV call - it checks
them (an unrecognised producer is a 400) and records them for provenance - but they never move the
sale to the producer. Use \`payware_operations_create_transaction\` from the merchant role if the
terminal producer is meant to be attributed.

⏳ **Deferred Merchant Leg** (optional, \`deferredAllowed\`, sent as \`trOptions.deferredAllowed\`). By default
the payer's institution pays with an instant or an internal transfer; \`deferredAllowed: true\` also lets it
use an ordinary credit transfer that settles later. Not for a till or terminal sale: an opt-in that carries
producer or terminal fields is refused with 400 \`ERR_DEFERRED_TRANSFER_NOT_ALLOWED\`, and this tool refuses it
before sending. **A deferred payment stays ACTIVE, i.e. pending, until the transfer settles, which can take
days**, so it can stay ACTIVE past its \`timeToLive\`: keep polling or wait for the callback, and never treat it
as expired yourself. Echoed as \`deferredAllowed: true\` when set.

**Transaction Types:**
- PLAIN: Basic transaction without visual codes
- QR: Transaction with QR code for mobile payments
- BARCODE: Transaction with barcode for scanning

**Required:** Merchant Partner ID and OAuth2 token (ISV authentication), currency and reasonL1. amount is optional; without it the tool sends 0.00, an amount the payer sets.

**QR code options** (type QR): qrFormat PNG, JPG or SVG (default SVG); qrBorder 1-10 modules (default 4); qrErrorCorrection LOW, MEDIUM, QUARTILE or HIGH (default QUARTILE); qrScale 1-100 pixels per module (default 16); qrVersion 1-40 (default 3).

**Barcode options** (type BARCODE): barFormat PNG, JPG or SVG (default SVG); barModuleWidth 1-10 (default 2); barBarHeight 15-1000 (default 100); barFontSize 0-24 (default 12); barHumanReadableLocation NONE, BOTTOM or TOP (default NONE).`,

  inputSchema: {
    type: 'object',
    required: ['merchantPartnerId', 'oauth2Token', 'reasonL1'],
    properties: {
      idempotencyKey: {
        type: "string",
        description: "Optional. Sent as the Idempotency-Key header. Use one value per payment (a UUID is typical) and the same value on every retry of it: a retry with the same key and body within 24 hours returns the transaction the first call created instead of a new one, and the result reports replayed: true. The same key with a different body is refused (422 ERR_IDEMPOTENCY_KEY_REUSED); a retry while the first call still runs gets 409 ERR_IDEMPOTENCY_KEY_IN_PROGRESS.",
        pattern: "^[\\x21-\\x7E]{1,255}$"
      },
      // ISV Authentication
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant (8 alphanumeric characters, e.g., "PZAYNMVE")'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
      },

      // Core transaction data
      type: {
        type: 'string',
        enum: ['PLAIN', 'QR', 'BARCODE'],
        default: 'PLAIN',
        description: 'Transaction type'
      },
      amount: {
        type: ['string', 'number'],
        description: 'Transaction amount (e.g., "25.50" or 25.50)'
      },
      currency: {
        type: 'string',
        default: 'EUR',
        description: 'Currency code (ISO 4217, e.g., EUR, USD, GBP)'
      },
      reasonL1: {
        type: 'string',
        description: 'Primary transaction reason/description (required)'
      },
      reasonL2: {
        type: 'string',
        description: 'Secondary transaction reason/description (optional)'
      },

      // Optional transaction metadata
      callbackUrl: {
        type: 'string',
        description: 'URL to receive transaction status updates'
      },
      account: {
        type: 'string',
        description: 'Account identifier'
      },
      friendlyName: {
        type: 'string',
        description: 'Human-readable transaction identifier'
      },
      shop: {
        type: 'string',
        description: 'Shop/location identifier'
      },
      timeToLive: {
        type: 'number',
        default: 120,
        description: "Time allowed for payment initiation in seconds. Once the payer's institution has started the payment, the transaction stays ACTIVE past it until the money has moved (seconds for an instant transfer, days with deferredAllowed); never infer EXPIRED from the clock."
      },
      deferredAllowed: {
        type: 'boolean',
        description: DEFERRED_ALLOWED_DESCRIPTION
      },
      passbackParams: {
        type: ['string', 'object'],
        description: 'Additional parameters to pass back in callbacks'
      },

      // QR and barcode options: one definition for every create tool (shared/media-options.js)
      ...QR_OPTION_PROPERTIES,
      ...BARCODE_OPTION_PROPERTIES,

      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler(params) {
    try {
      const result = await createTransaction(params);

      return {
        content: [{
          type: 'text',
          text: `✅ Transaction Created Successfully (ISV -> Merchant: ${params.merchantPartnerId})

📋 **Transaction Details:**
- **Transaction ID**: ${result.transactionId || 'N/A'}
- **Status**: ${result.status || 'CREATED'}
- **Type**: ${params.type}
- **Amount**: ${params.amount || 'N/A'} ${params.currency || 'EUR'}
- **Reason**: ${params.reasonL1}
- **TTL**: ${params.timeToLive || 120} seconds
${result.deferredAllowed === true ? '- **Deferred Merchant Leg allowed**: yes - the payment may stay ACTIVE until the transfer settles, which can take days\n' : ''}
🔗 **Integration Details:**
- **ISV Partner**: ${getPartnerIdSafe()}
- **Target Merchant**: ${params.merchantPartnerId}
- **OAuth2 Token**: ${params.oauth2Token.substring(0, 8)}...

${result.qrCodeUrl ? `🔲 **QR Code**: ${result.qrCodeUrl}` : ''}
${result.barcodeUrl ? `📊 **Barcode**: ${result.barcodeUrl}` : ''}
${result.paymentUrl ? `💳 **Payment URL**: ${result.paymentUrl}` : ''}

**Raw Response:**
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Transaction Creation Failed

**Error**: ${error.message}

**ISV Authentication Check:**
- Merchant Partner ID: ${params.merchantPartnerId || 'Missing'}
- OAuth2 Token: ${params.oauth2Token ? 'Provided' : 'Missing'}
- ISV Partner ID: ${getPartnerIdSafe()}

**Troubleshooting:**
- Verify OAuth2 token is valid and granted
- Ensure merchant partner ID is correct (8 characters)
- Check transaction parameters meet payware requirements
- Confirm ISV has authorization to act on behalf of merchant`
        }]
      };
    }
  }
};