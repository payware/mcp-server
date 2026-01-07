import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get transaction history via payware API (completed/expired transactions)
 * @param {Object} params - Transaction history parameters
 * @returns {Object} Transaction history response
 */
export async function getPITransactionHistory({
  transactionId,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Create JWT token for GET request (no contentSha256 needed for GET)
  const tokenData = createJWTToken(partnerId, privateKey, null);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions-history/${transactionId}`, {
      headers
    });

    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        code: error.response?.data?.code,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get payment institution transaction history tool implementation
 */
export const getPITransactionHistoryTool = {
  name: "payware_operations_get_transaction_history",
  description: `Get the complete history of a completed or expired payware transaction as a payment institution.

**Use Cases:**
- Retrieve details of completed transactions
- Get information about expired transactions
- Access finalized transaction data including final status
- Audit and reconciliation purposes

**Response includes:**
- Complete transaction details
- Final status (CONFIRMED, DECLINED, FAILED, EXPIRED)
- Status message (for failed/declined transactions)
- Payee/payer account details and BICs
- Transaction amounts, currency, and timestamps
- Creation and processing timeline

**Note:** This endpoint is throttled and may return HTTP 429 (Too Many Requests). Implement appropriate retry logic.`,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to retrieve history. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId"]
  },

  async handler(args) {
    const {
      transactionId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    const result = await getPITransactionHistory({
      transactionId,
      partnerId,
      privateKey,
      useSandbox
    });

    if (result.success) {
      const tx = result.transaction;
      const createdDate = tx.created ? new Date(tx.created * 1000).toISOString() : 'N/A';

      // Status emoji mapping
      const statusEmojis = {
        CONFIRMED: '✅',
        DECLINED: '❌',
        FAILED: '💥',
        EXPIRED: '⏰',
        CANCELLED: '🚫'
      };

      const statusEmoji = statusEmojis[tx.status] || '📄';
      const typeDisplay = tx.transactionType || 'DEFAULT';
      const initiatorDisplay = tx.initiatedBy || 'UNKNOWN';

      return {
        content: [{
          type: "text",
          text: `📜 **Payment Institution Transaction History**

**Transaction Information:**
- ID: ${tx.transactionId || transactionId}
- Type: ${typeDisplay}
- Initiated By: ${initiatorDisplay}
- Final Status: ${statusEmoji} ${tx.status || 'UNKNOWN'}
${tx.statusMessage ? `- Status Message: ${tx.statusMessage}` : ''}
- Created: ${createdDate}
- TTL: ${tx.timeToLive || 'N/A'} seconds

**Transaction Details:**
- Amount: ${tx.amount || 'N/A'} ${tx.currency || 'N/A'}
${tx.paymentMethod ? `- Payment Method: ${tx.paymentMethod}\n` : ''}- Reason L1: ${tx.reasonL1 || 'N/A'}
${tx.reasonL2 ? `- Reason L2: ${tx.reasonL2}` : ''}

**Payee Information:**
- Account: ${tx.payeeAccount || 'N/A'}
- Friendly Name: ${tx.payeeFriendlyName || 'N/A'}
- BIC: ${tx.payeeBIC || 'N/A'}

**Payer Information:**
- Account: ${tx.payerAccount || 'N/A'}
- Friendly Name: ${tx.payerFriendlyName || 'N/A'}
- BIC: ${tx.payerBIC || 'N/A'}

**Full Transaction History:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: GET ${baseUrl}/transactions-history/${transactionId}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Transaction Outcome:**
${tx.status === 'CONFIRMED'
  ? `✅ **Transaction Completed Successfully**
- Payment was processed and confirmed
- Funds should have been transferred between accounts`
  : tx.status === 'DECLINED'
  ? `❌ **Transaction Declined**
- Payment was declined by the payment institution
- Reason: ${tx.statusMessage || 'No specific reason provided'}`
  : tx.status === 'FAILED'
  ? `💥 **Transaction Failed**
- Payment failed during processing
- Reason: ${tx.statusMessage || 'No specific reason provided'}`
  : tx.status === 'EXPIRED'
  ? `⏰ **Transaction Expired**
- Transaction was not completed within the time limit
- No payment was processed`
  : tx.status === 'CANCELLED'
  ? `🚫 **Transaction Cancelled**
- Transaction was cancelled by the creator
- Reason: ${tx.statusMessage || 'No specific reason provided'}`
  : `📄 **Transaction Status: ${tx.status}**`
}

**⚠️ Historical Record:**
- This transaction is completed and cannot be modified
- Data is archived for audit and reconciliation purposes
- Use this information for financial reporting and analysis`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction History Retrieval Failed**

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

**Common Issues:**
1. **ERR_MISSING_TRANSACTION (404)**: Transaction not found in history
2. **HTTP 429 (Too Many Requests)**: API is throttled, implement retry logic
3. **Authentication Issues**: Verify JWT token and partner credentials
4. **Transaction Still Active**: Use \`payware_pi_get_transaction_status\` for active transactions

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Check if transaction is still active (not yet completed/expired)
3. Implement retry logic for rate limiting (HTTP 429)
4. Verify your payment institution credentials and API access
5. Ensure transaction was created or you have access to it

**Rate Limiting Notes:**
- This endpoint is throttled by payware
- If you receive HTTP 429, wait and retry
- Consider implementing exponential backoff for retries
- Avoid excessive polling of this endpoint

**Alternative Actions:**
- If transaction is still active: Use \`payware_pi_get_transaction_status\`
- If rate limited: Wait and retry after a delay
- If transaction not found: Verify the transaction ID exists`
        }]
      };
    }
  }
};