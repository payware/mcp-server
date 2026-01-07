import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Process a transaction via payware API (for merchants accepting payments)
 * @param {Object} params - Transaction processing parameters
 * @returns {Object} Transaction processing response
 */
export async function processTransaction({
  transactionId,
  amount,
  currency,
  reasonL1,
  reasonL2,
  account,
  friendlyName,
  shop,
  callbackUrl,
  passbackParams,
  timeToLive = 120,
  paymentMethod,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }
  
  if (!amount) {
    throw new Error('Amount is required for processing');
  }
  
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new Error('Amount must be a string or number representing currency value (e.g., "25.50" or 25.50)');
  }
  
  if (parseFloat(amount) <= 0) {
    throw new Error('Amount must be positive for processing');
  }
  
  if (!reasonL1) {
    throw new Error('reasonL1 is required (transaction grounds description)');
  }
  
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }
  
  // Build request body according to documentation
  const requestBody = {
    ...(account && { account }),
    ...(friendlyName && { friendlyName }),
    ...(shop && { shop }),
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    ...(paymentMethod && { paymentMethod }),
    trData: {
      amount: amount.toString(),
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    trOptions: {
      timeToLive
    }
  };
  
  // Convert to deterministic minimized JSON for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (POST requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
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
 * Process transaction tool implementation
 */
export const processTransactionTool = {
  name: "payware_operations_process_transaction",
  description: `Process a PEER transaction (for merchants accepting payments by scanning customer QR/barcode).

**Use Case:** Merchant scans customer's payware QR code or barcode to accept payment.
**Note:** Only PEER transactions (created by customers) can be processed by merchants.
**Flow:** Customer creates transaction → Merchant scans QR/barcode → Merchant processes transaction

**API Request Structure:**
\`\`\`json
{
  "shop": "...",
  "account": "...", 
  "friendlyName": "...",
  "callbackUrl": "...",
  "passbackParams": "...",
  "trData": {
    "amount": "25.50",    // REQUIRED for processing
    "currency": "EUR",    // REQUIRED for processing
    "reasonL1": "...",    // REQUIRED for processing
    "reasonL2": "..."
  },
  "trOptions": {
    "timeToLive": 300     // Overwrites original transaction TTL
  }
}
\`\`\``,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to process. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
      },
      amount: {
        type: ["number", "string"], 
        description: "Amount as currency value to process (e.g., 25.50 for €25.50). Must be positive",
        minimum: 0.01,
        maximum: 9999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code)",
        default: "EUR"
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
        description: "Account identifier (optional - uses default if not provided)",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "Account holder recognizable name (optional)",
        maxLength: 100
      },
      shop: {
        type: "string",
        description: "Shop code (optional - uses default if not provided)", 
        maxLength: 10
      },
      callbackUrl: {
        type: "string",
        description: "URL to receive transaction status callbacks",
        format: "uri"
      },
      passbackParams: {
        type: "string",
        description: "Parameters passed back through callback",
        maxLength: 200
      },
      timeToLive: {
        type: "number",
        description: "Time allowed for transaction processing in seconds",
        minimum: 60,
        maximum: 600,
        default: 120
      },
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "Payment method chosen by customer. A2A = direct transfer (lower fee, no rewards). CARD_FUNDED = card-linked account (higher fee, rewards eligible). BNPL = buy now pay later (installments). INSTANT_CREDIT = credit line approved at purchase."
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
    required: ["transactionId", "amount", "currency", "reasonL1"]
  },
  
  async handler(args) {
    const {
      transactionId,
      amount,
      currency = 'EUR',
      reasonL1,
      reasonL2,
      account,
      friendlyName,
      shop,
      callbackUrl,
      passbackParams,
      timeToLive = 120,
      paymentMethod,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;
    
    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }
    
    if (!amount || amount <= 0) {
      throw new Error("Amount is required and must be positive");
    }
    
    if (!reasonL1) {
      throw new Error("reasonL1 is required (transaction grounds description)");
    }
    
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }
    
    const result = await processTransaction({
      transactionId,
      amount,
      currency,
      reasonL1,
      reasonL2,
      account,
      friendlyName,
      shop,
      callbackUrl,
      passbackParams,
      timeToLive,
      paymentMethod,
      partnerId,
      privateKey,
      useSandbox
    });
    
    if (result.success) {
      return {
        content: [{
          type: "text",
          text: `🔄 **Transaction Processing Initiated**

**Transaction ID:** ${transactionId}
**Processing Status:** ✅ Successful

**Transaction Details:**
- Amount: ${amount} ${currency}
- Reason: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}
${paymentMethod ? `- Payment Method: ${paymentMethod}\n` : ''}- Time to Live: ${timeToLive} seconds
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}
${passbackParams ? `- Passback Params: ${passbackParams}` : ''}

**API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Next Steps:**
1. Transaction control transferred to payer
2. Wait for callback notification (if URL provided)
3. Monitor transaction status for completion
4. Handle CONFIRMED/DECLINED/FAILED states

**⚠️ Important:**
- Only merchants (payees) can process transactions
- Processing transfers control to the paying party
- Transaction will expire if not completed within TTL`
        }]
      };
    } else {
      return {
        content: [{
          type: "text", 
          text: `❌ **Transaction Processing Failed**

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
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found or expired
2. **ERR_UNKNOWN_ROLE**: Transaction generated by payee (can't process own transaction)
3. **ERR_ALREADY_PROCESSED**: Transaction already processed
4. **ERR_SPECIFYING_AMOUNT_NOT_ALLOWED**: Amount exceeds transaction limit

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Ensure you're not the transaction creator (merchants process peer transactions)
3. Check transaction hasn't already been processed
4. Verify amount doesn't exceed original transaction amount`
        }]
      };
    }
  }
};