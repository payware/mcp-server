import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get transaction status via payware API (active transactions)
 * @param {Object} params - Transaction status parameters
 * @returns {Object} Transaction status response
 */
export async function getPITransactionStatus({
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
    const response = await axios.get(`${baseUrl}/transactions/${transactionId}`, {
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
 * Get payment institution transaction status tool implementation
 */
export const getPITransactionStatusTool = {
  name: "payware_operations_get_transaction_status",
  description: `Get the current status of an active payware transaction as a payment institution.

**Use Cases:**
- Check transaction status and details
- Monitor transaction progress
- Get participant information (payee/payer accounts, BICs)
- Check remaining time to live

**Response includes:**
- Transaction ID and type
- Payee/payer account details and BICs
- Transaction amount and currency
- Reason lines and creation timestamp
- Remaining time to live
- Current transaction state

**Note:** This endpoint only returns active transactions. Use \`payware_pi_get_transaction_history\` for completed/expired transactions.`,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to check status. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
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

    const result = await getPITransactionStatus({
      transactionId,
      partnerId,
      privateKey,
      useSandbox
    });

    if (result.success) {
      const tx = result.transaction;
      const createdDate = tx.created ? new Date(tx.created * 1000).toISOString() : 'N/A';

      // Transaction type display
      const typeDisplay = tx.transactionType || 'DEFAULT';
      const initiatorDisplay = tx.initiatedBy || 'UNKNOWN';

      return {
        content: [{
          type: "text",
          text: `📊 **Payment Institution Transaction Status**

**Transaction Information:**
- ID: ${tx.transactionId || transactionId}
- Type: ${typeDisplay}
- Initiated By: ${initiatorDisplay}
- Status: ⏳ ACTIVE
- Created: ${createdDate}
- Remaining TTL: ${tx.timeToLive || 'N/A'} seconds

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

**Full API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: GET ${baseUrl}/transactions/${transactionId}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
1. ${!tx.payerAccount ? 'Transaction waiting for payer to process' : 'Transaction processed, waiting for finalization'}
2. ${tx.timeToLive && parseInt(tx.timeToLive) < 60 ? '⚠️ Transaction expires soon!' : 'Monitor remaining TTL'}
3. Use \`payware_pi_process_transaction\` if you need to process this transaction
4. Use \`payware_pi_finalize_transaction\` to confirm/decline after processing

**⚠️ Transaction State:**
- This is an **active** transaction
- Participants can still interact with it
- Will expire in ${tx.timeToLive || 'unknown'} seconds if not completed`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Status Check Failed**

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
1. **ERR_MISSING_TRANSACTION (404)**: Transaction not found, expired, or already completed
2. **Invalid Transaction ID**: Check transaction ID format (10 chars: 'pw'/'pr'/'ps' + 8 chars)
3. **Authentication Issues**: Verify JWT token and partner credentials

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Check if transaction has expired or been completed
3. Use \`payware_pi_get_transaction_history\` for completed/expired transactions
4. Verify your partner credentials and API access
5. Ensure transaction was created or you have access to it

**Alternative Actions:**
- If transaction is completed: Use \`payware_pi_get_transaction_history\`
- If transaction ID is wrong: Verify the correct transaction ID
- If access issues: Check your payment institution credentials`
        }]
      };
    }
  }
};