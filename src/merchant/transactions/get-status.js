import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';

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
      requestId: response.headers['x-request-id'],
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
  description: `Get status of an ACTIVE transaction by ID (for completed/expired transactions use transaction history tool).

**Endpoint:** GET /transactions/{transactionId}
**Use Case:** Check status of ACTIVE transactions only. This endpoint only returns transactions with ACTIVE status.
**Note:** For transactions with final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED), use 'payware_transactions_get_history' instead.

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
        description: "RSA private key for JWT token creation. Can use PAYWARE_PRIVATE_KEY_PATH env var as default.",
        default: getPrivateKeySafe()
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
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
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
- ID: ${result.transaction.id || 'N/A'}
- Type: ${result.transaction.type || 'N/A'}
- Amount: ${result.transaction.trData ? `${result.transaction.trData.amount} ${result.transaction.trData.currency}` : 'N/A'}
${result.transaction.paymentMethod ? `- Payment Method: ${result.transaction.paymentMethod}\n` : ''}- Description: ${result.transaction.description || 'N/A'}
- Created: ${result.transaction.createdAt || 'N/A'}
- Updated: ${result.transaction.updatedAt || 'N/A'}

**Full Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Status Meanings:**
- ⏳ ACTIVE: Active transaction pending processing or finalizing

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