import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

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
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!account) {
    throw new Error('account is required for payment institutions');
  }

  if (!friendlyName) {
    throw new Error('friendlyName is required for payment institutions');
  }

  if (!currency) {
    throw new Error('currency is required for payment institutions');
  }

  if (!reasonL1) {
    throw new Error('reasonL1 is required for payment institutions');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Build request body according to payment institution API documentation
  const requestBody = {
    account,
    friendlyName,
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    ...(paymentMethod && { paymentMethod }),
    trData: {
      ...(amount !== undefined && { amount: amount.toString() }),
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
        code: error.response?.data?.code,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Process payment institution transaction tool implementation
 */
export const processPITransactionTool = {
  name: "payware_operations_process_transaction",
  description: `Process a transaction as a payment institution. Payment institutions can process transactions created by others and must provide account/friendlyName details.

**Use Cases:**
- **As Payer (SRC)**: Process a transaction initiated by payee (pay a request)
- **As Payee (DST)**: Process a transaction initiated by payer (accept payment)
- **Cross-PI**: Process transactions from other payment institutions

**Required for Payment Institutions:**
- account: Your account identifier
- friendlyName: Your account holder name
- currency: Transaction currency (required)
- reasonL1: Transaction grounds description (required)

**API Request Structure:**
\`\`\`json
{
  "account": "GB29NWBK60161331926818",
  "friendlyName": "Jane Doe Bank",
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
      transactionId: {
        type: "string",
        description: "Transaction ID to process. Format: 2-char prefix + 8-char ID. Supports: 'pw' (standard), 'pr' (product), 'ps' (soundbite)",
        pattern: "^(pw|pr|ps)[0-9A-Za-z]{8}$"
      },
      account: {
        type: "string",
        description: "Your account identifier (required for payment institutions)",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "Your account holder recognizable name (required for payment institutions)",
        maxLength: 100
      },
      amount: {
        type: ["number", "string"],
        description: "Amount as currency value to process. For payee: must be <= original amount. For payer: can be >= original amount (tipping)",
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
        description: "Transaction grounds description (required for payment institutions - omit for SHIPPABLE to get merchant name)",
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
        description: "Time allowed for transaction finalization in seconds (PI can extend: 60-2592000, Merchant: original+120 max)",
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
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      },
      // Payment method for POI transactions
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "Payment method chosen by customer (for POI transactions only). A2A = direct transfer (lower fee, no rewards). CARD_FUNDED = card-linked account (higher fee, rewards eligible). BNPL = buy now pay later (installments). INSTANT_CREDIT = credit line approved at purchase."
      },
      // Delivery address for SHIPPABLE transactions
      deliveryAddress: {
        type: "object",
        description: "Delivery address (required when processing SHIPPABLE transactions)",
        properties: {
          fullName: {
            type: "string",
            description: "Recipient full name (required)",
            maxLength: 300
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
            description: "Region (required)",
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
        required: ["fullName", "streetAddressLine1", "zipCode", "city", "region", "country"]
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId", "account", "friendlyName", "currency", "reasonL1"]
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
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!account) {
      throw new Error("account is required for payment institutions");
    }

    if (!friendlyName) {
      throw new Error("friendlyName is required for payment institutions");
    }

    if (!currency) {
      throw new Error("currency is required for payment institutions");
    }

    if (!reasonL1) {
      throw new Error("reasonL1 is required for payment institutions");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
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
- Account: ${account}
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
3. Monitor transaction status for completion
4. Use \`payware_pi_finalize_transaction\` to confirm/decline the transaction
5. Handle final TRANSACTION_FINALIZED callbacks

**⚠️ Important:**
- As a payment institution, you must finalize this transaction
- Transaction will expire if not finalized within TTL
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
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found or expired
2. **ERR_ALREADY_PROCESSED**: Transaction already processed
3. **ERR_MISSING_PARTNER_ACCOUNT**: Account parameter missing or empty
4. **ERR_MISSING_FRIENDLY_NAME**: Friendly name parameter missing
5. **ERR_MISSING_CALLBACK_URL**: Callback URL required when processing as payee
6. **ERR_INVALID_AMOUNT**: Amount validation failed
7. **ERR_SPECIFYING_CURRENCY_NOT_ALLOWED**: Cannot change currency on merchant transactions

**Troubleshooting:**
1. Verify transaction ID is correct: 10 characters total, starts with 'pw' (standard), 'pr' (product), or 'ps' (soundbite)
2. Ensure account and friendlyName are provided
3. Check currency matches original transaction currency
4. Verify callback URL is provided (especially for payee role)
5. Validate amount constraints based on your role in the transaction
6. Check if transaction requires delivery address (SHIPPABLE type)`
        }]
      };
    }
  }
};