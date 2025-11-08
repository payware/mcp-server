import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Finalize a transaction as a payment institution via payware API
 * Payment institutions can update transaction status after execution in their network
 * @param {Object} params - Transaction finalization parameters
 * @returns {Object} Transaction finalization response
 */
export async function finalizeTransaction({
  transactionId,
  status,
  statusMessage,
  amount,
  fee,
  currency,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!status || !['CONFIRMED', 'CANCELLED', 'DECLINED', 'FAILED'].includes(status)) {
    throw new Error('status is required and must be one of: CONFIRMED, CANCELLED, DECLINED, FAILED');
  }

  if (['CANCELLED', 'DECLINED', 'FAILED'].includes(status) && !statusMessage) {
    throw new Error(`statusMessage is required for status: ${status}`);
  }

  if (status === 'CONFIRMED') {
    if (!amount) {
      throw new Error('amount is required for CONFIRMED transactions');
    }
    if (!currency) {
      throw new Error('currency is required for CONFIRMED transactions');
    }
    if (fee === undefined) {
      throw new Error('fee is required for CONFIRMED transactions (use 0 for no fee)');
    }
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Build request body according to payment institution API documentation
  const requestBody = {
    status,
    ...(statusMessage && { statusMessage }),
    ...(status === 'CONFIRMED' && {
      amount: amount.toString(),
      fee: fee.toString(),
      currency
    })
  };

  // Convert to deterministic minimized JSON for MD5 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentMd5 for the request body (PATCH requires contentMd5)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for MD5 calculation
    const response = await axios.patch(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
      headers,
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
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
 * Finalize transaction tool implementation
 */
export const finalizeTransactionTool = {
  name: "payware_operations_finalize_transaction",
  description: `Finalize a transaction as a payment institution. This updates the transaction status after execution in your payment network.

**Payment Institution Finalization:**
- **CONFIRMED**: Transaction executed successfully (requires amount, fee, currency)
- **CANCELLED**: Transaction cancelled by creator
- **DECLINED**: Transaction declined by payment institution (requires statusMessage)
- **FAILED**: Transaction failed during execution (requires statusMessage)

**Requirements:**
- Only payment institutions can finalize transactions
- Currency must match the processing currency of the transaction
- Amount/fee required for CONFIRMED status
- StatusMessage required for CANCELLED/DECLINED/FAILED status

**API Request Structure:**
\`\`\`json
{
  "status": "CONFIRMED",
  "amount": "57.60",
  "fee": "0.29",
  "currency": "EUR"
}
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to finalize. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
      },
      status: {
        type: "string",
        enum: ["CONFIRMED", "CANCELLED", "DECLINED", "FAILED"],
        description: "Final transaction status"
      },
      statusMessage: {
        type: "string",
        description: "Transaction failure/cancellation reason (required for CANCELLED, DECLINED, FAILED)",
        maxLength: 100
      },
      amount: {
        type: ["number", "string"],
        description: "Final transaction amount (required for CONFIRMED status)",
        minimum: 0.01,
        maximum: 9999999999999.99
      },
      fee: {
        type: ["number", "string"],
        description: "Fee amount collected by payment institution (required for CONFIRMED status, use 0 for no fee)",
        minimum: 0,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (required for CONFIRMED status, must match processing currency)"
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
    required: ["transactionId", "status"]
  },

  async handler(args) {
    const {
      transactionId,
      status,
      statusMessage,
      amount,
      fee,
      currency,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!status) {
      throw new Error("status is required and must be one of: CONFIRMED, CANCELLED, DECLINED, FAILED");
    }

    // Validate status-specific requirements
    if (['CANCELLED', 'DECLINED', 'FAILED'].includes(status) && !statusMessage) {
      throw new Error(`statusMessage is required for status: ${status}`);
    }

    if (status === 'CONFIRMED') {
      if (!amount) {
        throw new Error("amount is required for CONFIRMED transactions");
      }
      if (!currency) {
        throw new Error("currency is required for CONFIRMED transactions");
      }
      if (fee === undefined) {
        throw new Error("fee is required for CONFIRMED transactions (use 0 for no fee)");
      }
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    const result = await finalizeTransaction({
      transactionId,
      status,
      statusMessage,
      amount,
      fee,
      currency,
      partnerId,
      privateKey,
      useSandbox
    });

    if (result.success) {
      const statusEmojis = {
        CONFIRMED: '✅',
        CANCELLED: '🚫',
        DECLINED: '❌',
        FAILED: '💥'
      };

      const statusEmoji = statusEmojis[status] || '📄';

      return {
        content: [{
          type: "text",
          text: `${statusEmoji} **Transaction Finalized Successfully**

**Transaction ID:** ${transactionId}
**Final Status:** ${status}

**Finalization Details:**
${statusMessage ? `- Status Message: ${statusMessage}` : ''}
${amount ? `- Final Amount: ${amount} ${currency}` : ''}
${fee !== undefined ? `- Fee Collected: ${fee} ${currency}` : ''}

**Transaction Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: PATCH ${baseUrl}/transactions/${transactionId}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Callbacks Triggered:**
- **TRANSACTION_FINALIZED** callback sent to all parties
- Transaction moved to historical records
- Final status permanently recorded

**Next Steps:**
${status === 'CONFIRMED' ?
  `1. ✅ Payment completed successfully
2. Transaction funds should be processed in your network
3. Use \`payware_pi_get_transaction_history\` to retrieve details later` :
  `1. ⚠️ Payment not completed due to: ${statusMessage || status}
2. Transaction marked as ${status} in payware system
3. All parties notified via callbacks`
}

**⚠️ Important:**
- Transaction finalization is **permanent** and cannot be reversed
- This transaction is now complete in the payware system`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Finalization Failed**

**Transaction ID:** ${transactionId}
**Attempted Status:** ${status}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Finalization Issues:**
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found or expired
2. **ERR_TRANSACTION_NOT_PROCESSED**: Transaction hasn't been processed yet
3. **ERR_ALREADY_PROCESSED**: Transaction already finalized
4. **ERR_INVALID_STATUS**: Invalid status value provided
5. **ERR_MISSING_STATUS_MESSAGE**: Status message required for failed/declined/cancelled
6. **ERR_SPECIFYING_CURRENCY_NOT_ALLOWED**: Currency doesn't match transaction currency
7. **ERR_INVALID_AMOUNT**: Amount validation failed
8. **ERR_UNAUTHORIZED_OPERATION**: Not authorized to finalize this transaction

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Ensure transaction has been processed first
3. Check status is one of: CONFIRMED, CANCELLED, DECLINED, FAILED
4. Provide statusMessage for non-CONFIRMED statuses
5. Include amount, fee, currency for CONFIRMED status
6. Verify you are authorized to finalize this transaction
7. Ensure currency matches the original transaction currency`
        }]
      };
    }
  }
};