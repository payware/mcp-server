import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';
import { transactionSummary } from '../../shared/transaction-summary.js';

/**
 * Get transaction status from payware API
 * @param {Object} params - Parameters for status request
 * @returns {Object} Transaction status response
 */
export async function getTransactionStatus({ transactionId, partnerId, privateKey, useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }
  
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }
  
  // Create JWT token without body (GET request - no contentSha256 required)
  const tokenData = createJWTToken(partnerId, privateKey, null);
  
  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };
  
  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions/${transactionId}`, { headers });
    
    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Format transaction status for display
 */
function formatTransactionStatus(transaction) {
  const statusEmojis = {
    'ACTIVE': '⏳'
  };
  
  // If a transaction is returned from GET /transactions/{id}, it's always ACTIVE
  // (transactions with final statuses are only available via /transactions-history)
  const status = transaction.status || 'ACTIVE';
  const emoji = statusEmojis[status] || '⏳';
  
  return {
    emoji,
    status,
    formatted: `${emoji} ${status}`
  };
}

/**
 * Get transaction status tool implementation
 */
export const getTransactionStatusTool = {
  name: "payware_operations_get_transaction_status", 
  annotations: READS,
  description: `Get status of an ACTIVE transaction by ID (for completed/expired transactions use transaction history tool).

**Endpoint:** GET /transactions/{transactionId}
**Use Case:** Check status of ACTIVE transactions only. This endpoint only returns transactions with ACTIVE status.
**Note:** For transactions with final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED), use 'payware_operations_get_transaction_history' instead.

⏳ **ACTIVE can outlast \`timeToLive\`. Never infer EXPIRED from the clock.** Once the payer's institution has
started the payment (it locks the transaction immediately before the money moves, which you do not see),
the transaction stays ACTIVE past \`timeToLive\` until the money has moved: seconds for an instant or
internal transfer, days for a deferred one (a transaction created with \`deferredAllowed: true\`). Its
\`timeToLive\` then stops at the value it had when the payment started. Keep polling, or wait for the
callback: a transaction is EXPIRED only when payware says so, in the callback or in transaction history,
and one that is no longer returned here has a final status there.

🛍️ **Product-originated transactions carry a nested \`product\` object.** Since 2026-07-22 the
presentation fields are grouped under \`product\` rather than sitting flat on the response - the old
top-level \`imageUrl\` is gone. Discriminate a product-originated transaction by the **presence of the
object**, not by probing individual fields:

\`\`\`json
{ "transactionId": "pw7e4rCToG", "amount": "57.60", "currency": "EUR",
  "product": { "productId": "pr7e4rCToG", "type": "ITEM", "name": "Cotton T-shirt, black",
               "shortDescription": "...", "longDescription": "...",
               "imageUrl": "https://...", "imageDigest": "9f86d081...", "imageContentType": "image/png",
               "imageBytes": 20480, "termsUrl": "https://...", "termsText": "...",
               "regularPrice": "63.36", "shippable": false, "quickPay": true, "shopName": "My shop" } }
\`\`\`

Three things about that object:

- **\`imageDigest\` is an obligation, not decoration.** It is the SHA-256 payware pinned for the image
  at \`imageUrl\`. Fetch the image, verify its bytes against this digest before rendering it to a
  payer, and fall back to a neutral placeholder on mismatch. Present only when \`imageUrl\` is the
  product's own image.
- **\`regularPrice\` is display-only, and appears only when there is a genuine saving** - i.e. when it
  is higher than the transaction \`amount\`. The top-level \`amount\` and \`currency\` are authoritative
  and are what the payer pays; the object does not repeat them.
- **Availability follows the merchant's plan.** \`imageUrl\` and \`termsUrl\` are Standard and above;
  \`termsText\` and the descriptions are universal. A missing field is a plan boundary, not an error.

For a \`pr\`/\`ps\` product identifier the values are resolved live; for the resulting \`pw\` transaction
they are the snapshot frozen at creation, so the response always reflects what the payer could have
been shown at scan time.

💰 **Amounts follow the currency, not a fixed two decimals.** \`amount\`, \`fee\`, \`payerAmount\` and
\`payeeAmount\` are decimal strings at the smallest unit their own currency can be paid in - none for
JPY, two for EUR, eight for BTC. Parse them with a decimal type; never compare them as strings, and
never assume two places. \`feeRate\` carries up to six decimals and \`feeFixed\` full stored precision:
both are informational, and recomputing the fee from them and submitting that at finalize is rejected
with ERR_FEE_MISMATCH. Echo \`fee\` back unchanged instead.`,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to check status for"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Can use PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Can use PAYWARE_PRIVATE_KEY_PATH env var as default."
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId"],
    additionalProperties: false
  },
  
  async handler(args) {
    const { transactionId, partnerId = getPartnerIdSafe(), privateKey = getPrivateKeySafe(args.useSandbox ?? true), useSandbox = true } = args;
    
    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }
    
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }
    
    const result = await getTransactionStatus({ transactionId, partnerId, privateKey, useSandbox });
    
    if (result.success) {
      const statusInfo = formatTransactionStatus(result.transaction);
      
      return {
        content: [{
          type: "text",
          text: `📊 **Transaction Status Retrieved**

**Transaction:** ${transactionId}
**Status:** ${statusInfo.formatted}

**Transaction Details:**
${transactionSummary(result.transaction)}

**Full Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Status Meanings:**
- ⏳ ACTIVE: pending - not yet paid, or paid by the payer's institution with the money still moving. It can stay ACTIVE past \`timeToLive\` (seconds for an instant transfer, days with \`deferredAllowed\`), so never treat it as expired from the clock

**Note:** Only ACTIVE transactions are returned by this endpoint. For final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED), use the transaction history tool.`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Transaction Status**

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

**Possible Causes:**
1. Transaction ID not found or invalid
2. JWT token expired or invalid
3. No access permission to this transaction
4. API connectivity issues
5. Transaction belongs to different partner

**Troubleshooting:**
1. Verify the transaction ID is correct
2. Check if JWT token is valid and not expired
3. Ensure you have access to this transaction
4. Try creating a new transaction if this one is very old`
        }]
      };
    }
  }
};