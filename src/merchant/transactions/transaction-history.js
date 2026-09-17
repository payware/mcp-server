import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';

/**
 * Get transaction history from payware API (for completed/expired transactions)
 * @param {Object} params - Parameters for history request
 * @returns {Object} Transaction history response
 */
export async function getTransactionHistory({ transactionId, partnerId, privateKey, useSandbox = true }) {
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
    const response = await axios.get(`${baseUrl}/transactions-history/${transactionId}`, { headers });
    
    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const result = apiErrorResult(error);
    // 429, not 415. The server's rate limiter answers TOO_MANY_REQUESTS
    // (PartnerApiRateLimitFilter); 415 is an unsupported content type, which retrying can never
    // fix. Labelling a genuine 415 "throttled" told integrators to retry a request that is
    // permanently malformed, while a real throttle was reported as a hard failure.
    //
    // Kept as its own flag on top of apiErrorResult's `retryable`: `throttled` says specifically
    // "slow down", where `retryable` is also true for a 503, which means "payware is missing
    // configuration" and calls for a different response. apiErrorResult supplies retryAfterSeconds.
    result.error.throttled = error.response?.status === 429;
    return result;
  }
}

/**
 * Format transaction history for display
 */
function formatTransactionHistory(transaction) {
  const statusEmojis = {
    'CONFIRMED': '✅',
    'DECLINED': '❌', 
    'FAILED': '💥',
    'CANCELLED': '🚫',
    'EXPIRED': '⏰'
  };
  
  const typeEmojis = {
    'DEFAULT': '💳',
    'SHIPPABLE': '📦',
    'VOUCHER': '🎫',
    'CHEQUE': '📝'
  };
  
  const status = transaction.status || 'UNKNOWN';
  const type = transaction.transactionType || 'DEFAULT';
  const statusEmoji = statusEmojis[status] || '❓';
  const typeEmoji = typeEmojis[type] || '💳';
  
  return {
    statusEmoji,
    typeEmoji,
    status,
    type,
    formattedStatus: `${statusEmoji} ${status}`,
    formattedType: `${typeEmoji} ${type}`
  };
}

/**
 * Get transaction history tool implementation
 */
export const getTransactionHistoryTool = {
  name: "payware_operations_get_transaction_history", 
  description: `Get history of completed/finalized transactions with final statuses.

**Endpoint:** GET /transactions-history/{transactionId}
**Use Case:** Retrieve transactions with final statuses: CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED.
**Note:** For ACTIVE transactions, use 'payware_transactions_get_transaction_status' instead.

📦 **This is where the delivery address lives.** For a SHIPPABLE transaction, \`deliveryAddress\`
(fullName, streetAddressLine1/2, zipCode, city, region, country, phoneNumber, email) is returned
here and **only** here. It was removed from the finalized callback on 2026-08-07: a callback is
delivered to whatever certificate the merchant's endpoint happens to present, which is an acceptable
trade for a transaction id and an amount and not one for a shopper's home address. This endpoint is
JWT-authenticated, tenant-scoped and runs over a verified channel. So the pattern is: the callback
tells you the shipment is ready, and this call gives you the address to ship to.

⚠️ **Requires Standard or Premium.** This endpoint was ungated until 2026-08-21 and is now on the
same plan gate as the rest of the transaction surface, so a **Basic** merchant - or an ISV acting on
behalf of one - now gets **403**. If reading history started failing without a code change, this is
why. Financial institutions are unaffected; banks are always Premium.

⏱️ **Rate limited, like every payware endpoint.** A 429 carries \`ERR_RATE_LIMIT_EXCEEDED\` and a
\`Retry-After\` header, in seconds; the request was not processed, so the identical request is safe to
retry once the window passes. The failure result exposes this as \`error.throttled\`,
\`error.retryable\` and \`error.retryAfterSeconds\`.`,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to get history for. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
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
    
    const result = await getTransactionHistory({ transactionId, partnerId, privateKey, useSandbox });
    
    if (result.success) {
      const formatInfo = formatTransactionHistory(result.transaction);
      
      // Format dates
      const created = result.transaction.created ? new Date(result.transaction.created * 1000).toISOString() : 'N/A';
      const finalized = result.transaction.finalized ? new Date(result.transaction.finalized * 1000).toISOString() : 'N/A';
      
      return {
        content: [{
          type: "text",
          text: `📊 **Transaction History Retrieved**

**Transaction:** ${transactionId}
**Type:** ${formatInfo.formattedType}
**Status:** ${formatInfo.formattedStatus}

**Transaction Details:**
- ID: ${result.transaction.transactionId || 'N/A'}
- Initiated By: ${result.transaction.initiatedBy || 'N/A'}
- Amount: ${result.transaction.amount ? `${result.transaction.amount} ${result.transaction.currency}` : 'N/A'}
${result.transaction.paymentMethod ? `- Payment Method: ${result.transaction.paymentMethod}\n` : ''}- Reason: ${result.transaction.reasonL1 || 'N/A'}${result.transaction.reasonL2 ? ` (${result.transaction.reasonL2})` : ''}

**Parties:**
- Payee: ${result.transaction.payeeFriendlyName || 'N/A'} (${result.transaction.payeeAccount || 'N/A'})
- Payer: ${result.transaction.payerFriendlyName || 'N/A'} (${result.transaction.payerAccount || 'N/A'})
- Payee BIC: ${result.transaction.payeeBIC || 'N/A'}
- Payer BIC: ${result.transaction.payerBIC || 'N/A'}

**Timeline:**
- Created: ${created}
- Finalized: ${finalized}
- Time to Live: ${result.transaction.timeToLive || 'N/A'} seconds

**Status Information:**
${result.transaction.status ? `- Final Status: ${formatInfo.formattedStatus}` : ''}
${result.transaction.statusMessage ? `- Status Message: ${result.transaction.statusMessage}` : ''}

${result.transaction.deliveryAddress ? `
**Delivery Address:**
- Name: ${result.transaction.deliveryAddress.fullName || 'N/A'}
- Address: ${result.transaction.deliveryAddress.streetAddressLine1 || 'N/A'}
${result.transaction.deliveryAddress.streetAddressLine2 ? `  ${result.transaction.deliveryAddress.streetAddressLine2}` : ''}
- City: ${result.transaction.deliveryAddress.city || 'N/A'}, ${result.transaction.deliveryAddress.zipCode || 'N/A'}
- Region: ${result.transaction.deliveryAddress.region || 'N/A'}
- Country: ${result.transaction.deliveryAddress.country || 'N/A'}
- Phone: ${result.transaction.deliveryAddress.phoneNumber || 'N/A'}
- Email: ${result.transaction.deliveryAddress.email || 'N/A'}
` : ''}

**Full Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Status Meanings:**
- ✅ CONFIRMED: Successfully finalized
- ❌ DECLINED: Declined by the user, processing or finalizing payment institutions
- 💥 FAILED: Failed due to technical reasons or other
- 🚫 CANCELLED: Transaction canceled by the originator
- ⏰ EXPIRED: Time to live of the transaction has passed

**Note:** This endpoint is throttled and only returns transactions with final statuses. ACTIVE transactions cannot be retrieved here.`
        }]
      };
    } else {
      let errorText = `❌ **Failed to Get Transaction History**

**Transaction ID:** ${transactionId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}`;

      if (result.error.throttled) {
        errorText += `

**⚠️ THROTTLED REQUEST**
This endpoint has rate limiting. You've made too many requests recently.
Please wait before trying again.`;
      }

      errorText += `

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Issues:**
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found
2. **Too Many Requests (429)**: API rate limit exceeded
3. **ERR_METHOD_NOT_ALLOWED**: HTTP method issue

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Ensure transaction exists and you have access to it
3. If getting rate limit errors, wait 60 seconds before retrying
4. For ACTIVE transactions, use 'payware_transactions_get_transaction_status' instead
5. This endpoint only returns transactions with final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED)`;

      return {
        content: [{
          type: "text",
          text: errorText
        }]
      };
    }
  }
};