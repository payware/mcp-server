import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { COMMITS } from '../../shared/tool-annotations.js';

/** Product, placement and soundbite codes: the server takes reasonL1 from the product when it is omitted. */
const PRODUCT_CODE = /^(pr|pl|ps)/;

/**
 * What the server refuses on every institution process, said before the call. The amount: the server
 * defaults an absent one to 0.00 and refuses anything not above zero (FIValidationService
 * .validateAmountGreaterThanZero, ERR_INVALID_AMOUNT), so it is required. reasonL1: required too, except
 * for a product, placement or soundbite code (TransactionControllerService fills it from the product).
 */
export function checkProcessArgs({ transactionId, amount, reasonL1 }) {
  if (amount === undefined || amount === null || amount === '' || !(Number(amount) > 0)) {
    throw new Error('amount is required and must be above zero: the server refuses a process without one (ERR_INVALID_AMOUNT)');
  }
  if (!reasonL1 && !PRODUCT_CODE.test(String(transactionId))) {
    throw new Error('reasonL1 is required, except for a product (pr), placement (pl) or soundbite (ps) code, whose reason the server takes from the product');
  }
}

/**
 * Process a transaction as a payment institution via payware API
 * Payment institutions can process transactions they didn't create
 * @param {Object} params - Transaction processing parameters
 * @returns {Object} Transaction processing response
 */
export async function processPITransaction({
  transactionId,
  account,
  friendlyName,
  amount,
  currency,
  reasonL1,
  reasonL2,
  callbackUrl,
  passbackParams,
  timeToLive,
  partnerId,
  privateKey,
  // Delivery address for SHIPPABLE transactions
  deliveryAddress,
  // Payment method for POI transactions (Payment Choice Architecture)
  paymentMethod,
  idempotencyKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  // No account check here: the server requires one only from the payee's institution, that is for a
  // transaction its payer created (FIValidationService.accountIsPayees). The payer's institution sends
  // none - payware does not keep the payer's account, and one that is sent is ignored.

  if (!friendlyName) {
    throw new Error('friendlyName is required for payment institutions');
  }

  if (!currency) {
    throw new Error('currency is required for payment institutions');
  }

  checkProcessArgs({ transactionId, amount, reasonL1 });

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Build request body according to payment institution API documentation
  const requestBody = {
    ...(account && { account }),
    friendlyName,
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    ...(paymentMethod && { paymentMethod }),
    trData: {
      amount: amount.toString(),
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    ...(timeToLive && {
      trOptions: {
        timeToLive
      }
    }),
    ...(deliveryAddress && { deliveryAddress })
  };

  // Convert to deterministic minimized JSON for SHA-256 calculation
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
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const response = await axios.post(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
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
    return apiErrorResult(error);
  }
}

/**
 * Process payment institution transaction tool implementation
 */
export const processPITransactionTool = {
  name: "payware_operations_process_transaction",
  annotations: COMMITS,
  description: `Process a transaction as a payment institution. Payment institutions can process transactions created by others and must provide friendlyName, and account when processing as the payee.

**Use Cases:**
- **As Payer (SRC)**: Process a transaction initiated by payee (pay a request)
- **As Payee (DST)**: Process a transaction initiated by payer (accept payment)
- **Cross-PI**: Process transactions from other payment institutions

**Required for Payment Institutions:**
- friendlyName: Your account holder name
- account: the account the money is paid into, only when processing as the payee (a transaction its payer created, role SRC; otherwise 400 ERR_MISSING_PARTNER_ACCOUNT). As the payer's institution leave it out: payware does not keep the payer's account, and one that is sent is ignored
- currency: Transaction currency (required)
- amount: above zero (required: the server refuses a process without one)
- reasonL1: required, except for a product, placement or soundbite code, whose reason the server takes from the product

**After processing (as the payer's institution):** take the payer's single approval of both transfers and reserve the amount, then finalize in two calls with \`payware_operations_finalize_transaction\`: EXECUTING immediately before money moves (payware checks everything and locks; a refusal means nothing moves), execute the Merchant Leg, and CONFIRMED only once it has completed (or FAILED). The Fee Leg follows CONFIRMED for INSTANT and INTERNAL transfers and goes together with the Merchant Leg for DEFERRED. Once your institution has sent EXECUTING, the transaction shows as EXECUTING to your institution only; the merchant still sees ACTIVE.

**\`deferredAllowed\` in the response.** Present, and \`true\`, only when the merchant opted this transaction in to a deferred Merchant Leg. Only then may EXECUTING carry \`transferType: DEFERRED\` (an ordinary credit transfer that settles later); otherwise it is refused with ERR_DEFERRED_TRANSFER_NOT_ALLOWED. Absent means instant or internal only.

**API Request Structure:**
\`\`\`json
{
  "friendlyName": "Jane Doe",
  "callbackUrl": "https://callback.url",
  "passbackParams": "internal-ref-123",
  "trData": {
    "amount": "57.60",
    "currency": "EUR",
    "reasonL1": "Bill payment",
    "reasonL2": "Invoice #12345"
  },
  "trOptions": {
    "timeToLive": 300
  }
}
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      idempotencyKey: {
        type: "string",
        description: "Optional. Sent as the Idempotency-Key header. Use one value per payment (a UUID is typical) and the same value on every retry of it: a retry with the same key and body within 24 hours returns the transaction the first call created instead of a new one, and the result reports replayed: true. The same key with a different body is refused (422 ERR_IDEMPOTENCY_KEY_REUSED); a retry while the first call still runs gets 409 ERR_IDEMPOTENCY_KEY_IN_PROGRESS.",
        pattern: "^[\\x21-\\x7E]{1,255}$"
      },
      transactionId: {
        type: "string",
        description: "The id the payer scanned: 'pw' (a transaction), 'pr' (product), 'pl' (placement: pays as its product, and the payment is attributed to the placement), 'ps' (soundbite) or 'pi' (a POI with a price set). A product, placement, soundbite or POI id creates the pw transaction the response returns; finalize that pw id. Up to 32 characters: identifiers may grow beyond today's 10.",
        pattern: "^(pw|pr|pl|ps|pi)[0-9A-Za-z]{8,30}$"
      },
      account: {
        type: "string",
        description: "The account the money is paid into. Required only when processing as the payee, a transaction its payer created (role SRC); 400 ERR_MISSING_PARTNER_ACCOUNT without it. Leave it out as the payer's institution: payware does not keep the payer's account, and one that is sent is ignored.",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "Your account holder recognizable name (required for payment institutions)",
        maxLength: 100
      },
      amount: {
        type: ["number", "string"],
        description: "Amount to process, above zero (required: the server refuses a process without one, ERR_INVALID_AMOUNT). As the payer: at least the requested amount, more for a tip. As the payee: at most what the payer offered. For a merchant's transaction not below its amount.",
        minimum: 0.01,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code, required for payment institutions)"
      },
      reasonL1: {
        type: "string",
        description: "Transaction grounds description. Required for a pw or pi id; for a product, placement or soundbite code the server takes it from the product when omitted (for a SHIPPABLE product, the merchant and shop name).",
        maxLength: 100
      },
      reasonL2: {
        type: "string",
        description: "Transaction grounds description continuation (optional - omit for SHIPPABLE to get product name)",
        maxLength: 100
      },
      callbackUrl: {
        type: "string",
        description: "HTTPS URL to receive transaction status callbacks (mandatory when processing as payee)",
        format: "uri"
      },
      passbackParams: {
        type: "string",
        description: "Parameters passed back through callback",
        maxLength: 200
      },
      timeToLive: {
        type: "number",
        description: "Time allowed until payware accepts EXECUTING (the execution lock), in seconds; a locked transaction no longer expires (PI can extend: 60-2592000, Merchant: original+120 max)",
        minimum: 60,
        maximum: 2592000
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default."
      },
      // Payment method for POI transactions
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "How the payer pays, recorded on any transaction an institution processes (and only then: a merchant's process does not record it). A2A = account-to-account transfer. CARD_FUNDED = card-funded transfer. BNPL = buy now pay later. INSTANT_CREDIT = credit approved at purchase. Fee resolution follows it."
      },
      // Delivery address for SHIPPABLE transactions
      deliveryAddress: {
        type: "object",
        description: "Delivery address (required when processing SHIPPABLE transactions)",
        properties: {
          fullName: {
            type: "string",
            description: "Recipient full name (required)",
            maxLength: 200
          },
          streetAddressLine1: {
            type: "string",
            description: "Street address line 1 (required)",
            maxLength: 300
          },
          streetAddressLine2: {
            type: "string",
            description: "Street address line 2 (optional)",
            maxLength: 300
          },
          zipCode: {
            type: "string",
            description: "ZIP code (required)",
            maxLength: 20
          },
          city: {
            type: "string",
            description: "City name (required)",
            maxLength: 100
          },
          region: {
            type: "string",
            description: "Region or state (optional: many countries have none)",
            maxLength: 200
          },
          country: {
            type: "string",
            description: "Country (required)",
            maxLength: 32
          },
          phoneNumber: {
            type: "string",
            description: "Recipient phone number (required if email not provided)",
            maxLength: 255
          },
          email: {
            type: "string",
            description: "Recipient email address (required if phoneNumber not provided)",
            format: "email",
            maxLength: 255
          }
        },
        // DeliveryAddressValidationService: region is optional; a phone number or an email is required.
        required: ["fullName", "streetAddressLine1", "zipCode", "city", "country"]
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId", "friendlyName", "currency", "amount"]
  },

  async handler(args) {
    const {
      transactionId,
      account,
      friendlyName,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      passbackParams,
      timeToLive,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      paymentMethod,
      deliveryAddress,
      idempotencyKey,
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!friendlyName) {
      throw new Error("friendlyName is required for payment institutions");
    }

    if (!currency) {
      throw new Error("currency is required for payment institutions");
    }

    checkProcessArgs({ transactionId, amount, reasonL1 });

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }

    const result = await processPITransaction({
      transactionId,
      account,
      friendlyName,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      passbackParams,
      timeToLive,
      partnerId,
      privateKey,
      paymentMethod,
      deliveryAddress,
      idempotencyKey,
      useSandbox
    });

    if (result.success) {
      return {
        content: [{
          type: "text",
          text: `🔄 **Payment Institution Transaction Processing Initiated**

**Transaction ID:** ${transactionId}
**Processing Status:** ✅ Successful

**Your Details:**
${account ? `- Account: ${account}` : '- Account: not sent (the payer\'s institution sends none)'}
- Friendly Name: ${friendlyName}
${amount ? `- Amount: ${amount} ${currency}` : ''}
${reasonL1 ? `- Reason: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}` : ''}
${paymentMethod ? `- Payment Method: ${paymentMethod}` : ''}
${timeToLive ? `- Time to Live: ${timeToLive} seconds` : ''}
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}
${passbackParams ? `- Passback Params: ${passbackParams}` : ''}

**Transaction Details:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Next Steps:**
1. **TRANSACTION_PROCESSED** callback will be sent to counterparty
2. Wait for callback notification to your URL (if provided)
3. As the payer's institution, take the payer's single approval of both transfers and reserve the amount (or finalize with DECLINED if the payer declines)
4. Immediately before money moves, use \`payware_operations_finalize_transaction\` with status EXECUTING, echoing \`amount\`, \`fee\` and \`currency\` unchanged and naming the \`transferType\`${result.transaction?.deferredAllowed === true ? ' (this transaction carries deferredAllowed: true, so DEFERRED is allowed)' : ' (INSTANT or INTERNAL: this transaction does not carry deferredAllowed)'}. If payware refuses, release the reservation and move nothing
5. Execute the Merchant Leg (\`amount\` minus \`fee\`, to the payee); send CONFIRMED once it has completed (the status alone is enough), or FAILED if it was rejected
6. Fee Leg, where \`fee\` is above zero, to \`feeAccount\`: after CONFIRMED for INSTANT and INTERNAL, together with the Merchant Leg for DEFERRED
7. Handle final TRANSACTION_FINALIZED callbacks

**⚠️ Important:**
- As a payment institution, you must finalize this transaction
- It expires if EXECUTING has not been accepted within its time to live; once payware has accepted EXECUTING it no longer expires
- Callback URL is mandatory when processing as payee`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Payment Institution Transaction Processing Failed**

**Transaction ID:** ${transactionId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Payment Institution Issues:**
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found. **ERR_TRANSACTION_EXPIRED** (also 404): its time to live has run out and it is closed as unpaid
2. **ERR_ALREADY_PROCESSED**: Transaction already processed. **ERR_PAYEE_UNAVAILABLE** (409): the merchant being paid cannot accept payments; nothing was created or changed, do not take the payer's authorisation
3. **ERR_MISSING_PARTNER_ACCOUNT**: no account while processing as the payee (a transaction its payer created)
4. **ERR_MISSING_FRIENDLY_NAME**: Friendly name parameter missing
5. **ERR_MISSING_CALLBACK_URL**: Callback URL required when processing as payee
6. **ERR_INVALID_AMOUNT**: Amount validation failed
7. **ERR_SPECIFYING_CURRENCY_NOT_ALLOWED**: Cannot change currency on merchant transactions

**Troubleshooting:**
1. Verify transaction ID is correct: up to 32 characters, starts with 'pw' (standard), 'pr' (product), 'pl' (placement), 'ps' (soundbite) or 'pi' (POI)
2. Ensure friendlyName is provided, and account when processing as the payee
3. Check currency matches original transaction currency
4. Verify callback URL is provided (especially for payee role)
5. Validate amount constraints based on your role in the transaction
6. Check if transaction requires delivery address (SHIPPABLE type)`
        }]
      };
    }
  }
};