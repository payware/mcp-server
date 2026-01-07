import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Cancel a transaction via payware API
 * @param {Object} params - Transaction cancellation parameters
 * @returns {Object} Transaction cancellation response
 */
export async function cancelTransaction({
  transactionId,
  statusMessage,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }
  
  if (!statusMessage) {
    throw new Error('Status message is required (cancellation reason)');
  }
  
  if (statusMessage.length > 100) {
    throw new Error('Status message cannot exceed 100 characters');
  }
  
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }
  
  // Build request body according to documentation
  const requestBody = {
    status: 'CANCELLED',
    statusMessage
  };
  
  // Convert to deterministic minimized JSON for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (PATCH requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1' // Required: current API version
  };

  try {
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
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
        code: error.response?.data?.errorCode,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Cancel transaction tool implementation
 */
export const cancelTransactionTool = {
  name: "payware_operations_cancel_transaction",
  description: "Cancel an ACTIVE transaction created by this merchant. Only the merchant who created the transaction can cancel it, and only before it has been processed.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to cancel (must be ACTIVE transaction created by this merchant). Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
      },
      statusMessage: {
        type: "string",
        description: "Reason for cancellation (required)",
        maxLength: 100,
        minLength: 1
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
    required: ["transactionId", "statusMessage"]
  },
  
  async handler(args) {
    const {
      transactionId,
      statusMessage,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;
    
    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }
    
    if (!statusMessage) {
      throw new Error("Status message is required (reason for cancellation)");
    }
    
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }
    
    const result = await cancelTransaction({
      transactionId,
      statusMessage,
      partnerId,
      privateKey,
      useSandbox
    });
    
    if (result.success) {
      return {
        content: [{
          type: "text",
          text: `🚫 **Transaction Cancelled Successfully**

**Transaction ID:** ${transactionId}
**Status:** ${result.transaction.status || 'CANCELLED'}

**Cancellation Details:**
- Reason: ${statusMessage}
- Amount: ${result.transaction.amount ? `${result.transaction.amount} ${result.transaction.currency}` : 'N/A'}
- Cancelled At: ${result.timestamp}
- Cancelled By: Transaction Creator (Merchant)

**API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Important Notes:**
- ✅ Transaction successfully cancelled by its creator
- 🔒 No payment processing will occur
- 📧 Callbacks may be sent to notify interested parties
- ⏰ Cancellation is permanent and cannot be undone
- 👤 Only the merchant who created this transaction can cancel it

**Merchant Cancellation Rules:**
- ✅ Can cancel: Active transactions you created
- ❌ Cannot cancel: Transactions created by others
- ❌ Cannot cancel: Already processed transactions
- ❌ Cannot cancel: Expired transactions

**Next Steps:**
1. Wait for callback confirmation (if configured)
2. Update your internal systems
3. Notify customers if applicable
4. Create new transaction if payment still needed`
        }]
      };
    } else {
      return {
        content: [{
          type: "text", 
          text: `❌ **Transaction Cancellation Failed**

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
1. **ERR_MISSING_TRANSACTION**: Transaction not found or expired
2. **ERR_ALREADY_PROCESSED**: Transaction already processed, cannot cancel
3. **ERR_UNAUTHORIZED_OPERATION**: Only transaction creator can cancel
4. **ERR_INVALID_STATUS_MESSAGE**: Status message invalid or too long

**Merchant Cancellation Restrictions:**
- ⚠️ **Creator Only**: Only the merchant who created the transaction can cancel it
- ⚠️ **Active Only**: Transaction must be in ACTIVE state (not processed/expired)
- ⚠️ **Before Processing**: Cannot cancel after merchant/PI has processed it
- ⚠️ **Before Expiry**: Cannot cancel expired transactions

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. **Ensure you are the transaction creator** (not just any merchant)
3. Check transaction hasn't been processed already by anyone
4. Verify status message is under 100 characters
5. Ensure transaction is still active (not expired)
6. Confirm you created this transaction with your merchant account`
        }]
      };
    }
  }
};