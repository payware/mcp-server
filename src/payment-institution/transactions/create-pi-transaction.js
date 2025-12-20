import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Create a payment institution transaction via payware API
 * Payment institutions must specify role (SRC=payer, DST=payee) and account details
 * @param {Object} params - Transaction parameters
 * @returns {Object} Transaction response
 */
export async function createPITransaction({
  role,
  account,
  friendlyName,
  type = 'PLAIN',
  amount,
  currency = 'EUR',
  reasonL1,
  reasonL2,
  callbackUrl,
  timeToLive = 120,
  partnerId,
  privateKey,
  passbackParams,
  // QR Options
  qrFormat,
  qrBorder,
  qrErrorCorrection,
  qrScale,
  qrVersion,
  // Barcode Options
  barFormat,
  barModuleWidth,
  barBarHeight,
  barFontSize,
  barHumanReadableLocation,
  useSandbox = true
}) {
  if (!role || !['SRC', 'DST'].includes(role)) {
    throw new Error('role is required and must be either "SRC" (payer) or "DST" (payee)');
  }

  if (!account) {
    throw new Error('account is required (unique identifier of the account)');
  }

  if (!friendlyName) {
    throw new Error('friendlyName is required (account holder recognizable name)');
  }

  if (amount !== undefined && (typeof amount !== 'string' && typeof amount !== 'number')) {
    throw new Error('Amount must be a string or number representing currency value (e.g., "25.50" or 25.50)');
  }

  if (amount !== undefined && parseFloat(amount) < 0) {
    throw new Error('Amount must be non-negative');
  }

  if (!['PLAIN', 'QR', 'BARCODE'].includes(type)) {
    throw new Error('Transaction type must be PLAIN, QR, or BARCODE');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Build QR options if applicable
  const qrOptions = {};
  if (type === 'QR') {
    if (qrFormat) qrOptions.qrFormat = qrFormat;
    if (qrBorder !== undefined) qrOptions.qrBorder = qrBorder;
    if (qrErrorCorrection) qrOptions.qrErrorCorrection = qrErrorCorrection;
    if (qrScale) qrOptions.qrScale = qrScale;
    if (qrVersion) qrOptions.qrVersion = qrVersion;
  }

  // Build barcode options if applicable
  const barOptions = {};
  if (type === 'BARCODE') {
    if (barFormat) barOptions.barFormat = barFormat;
    if (barModuleWidth) barOptions.barModuleWidth = barModuleWidth;
    if (barBarHeight) barOptions.barBarHeight = barBarHeight;
    if (barFontSize) barOptions.barFontSize = barFontSize;
    if (barHumanReadableLocation) barOptions.barHumanReadableLocation = barHumanReadableLocation;
  }

  // Build request body according to payment institution API documentation
  const requestBody = {
    role,
    account,
    friendlyName,
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && {
      passbackParams: typeof passbackParams === 'string' ? passbackParams : JSON.stringify(passbackParams)
    }),
    ...(amount !== undefined && {
      trData: {
        amount: amount.toString(),
        currency,
        ...(reasonL1 && { reasonL1 }),
        ...(reasonL2 && { reasonL2 })
      }
    }),
    trOptions: {
      type,
      timeToLive
    },
    ...(type === 'QR' && Object.keys(qrOptions).length > 0 && { qrOptions }),
    ...(type === 'BARCODE' && Object.keys(barOptions).length > 0 && { barOptions })
  };

  // Convert to deterministic minimized JSON as required by payware API for MD5 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentMd5 for the request body (POST requires contentMd5)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1' // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for MD5 calculation
    // This ensures the server calculates the same MD5 hash
    const response = await axios.post(`${baseUrl}/transactions`, minimizedBodyString, {
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
 * Create payment institution transaction tool implementation
 */
export const createPITransactionTool = {
  name: "payware_operations_create_transaction",
  description: `Create a new payware transaction as a payment institution. Payment institutions must specify their role and account details.

**Payment Institution Features:**
- **Role**: DST (payee/receiver) or SRC (payer/sender)
- **Account**: Required unique account identifier
- **FriendlyName**: Required account holder name
- **P2P Support**: Cross-payment institution transactions
- **Flexible Amounts**: Support for amount-flexible transactions

**API Request Structure:**
\`\`\`json
{
  "role": "DST",
  "account": "GB29NWBK60161331926818",
  "friendlyName": "John Doe",
  "callbackUrl": "https://callback.url",
  "passbackParams": "custom data",
  "trData": {
    "amount": "57.60",
    "currency": "EUR",
    "reasonL1": "Payment reason",
    "reasonL2": "Additional details"
  },
  "trOptions": {
    "type": "QR",
    "timeToLive": 300
  },
  "qrOptions": { ... }
}
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      role: {
        type: "string",
        enum: ["SRC", "DST"],
        description: "Transaction role - SRC (payer/sender) or DST (payee/receiver)"
      },
      account: {
        type: "string",
        description: "Unique identifier of the account (required)",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "Account holder recognizable name (required)",
        maxLength: 100
      },
      type: {
        type: "string",
        enum: ["PLAIN", "QR", "BARCODE"],
        description: "Transaction type",
        default: "PLAIN"
      },
      amount: {
        type: "number",
        description: "Amount as currency value (e.g., 25.50 for €25.50). Can be 0 for amount-flexible transactions",
        minimum: 0,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code)",
        default: "EUR"
      },
      reasonL1: {
        type: "string",
        description: "Transaction grounds description",
        maxLength: 100
      },
      reasonL2: {
        type: "string",
        description: "Transaction grounds description continuation",
        maxLength: 100
      },
      timeToLive: {
        type: "number",
        description: "Time allowed for payment initiation in seconds (60-2592000 for PIs)",
        minimum: 60,
        maximum: 2592000,
        default: 120
      },
      callbackUrl: {
        type: "string",
        description: "HTTPS URL to receive transaction status callbacks",
        format: "uri"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe(true)
      },
      passbackParams: {
        type: "string",
        description: "Additional parameters passed back in callbacks (max 200 chars)",
        maxLength: 200
      },
      // QR Code Options
      qrFormat: {
        type: "string",
        enum: ["PNG", "JPEG", "SVG"],
        description: "Image format for QR code (only when type=QR, default: SVG)"
      },
      qrBorder: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Border size in modules around QR code (only when type=QR, default: 4)"
      },
      qrErrorCorrection: {
        type: "string",
        enum: ["LOW", "MEDIUM", "QUARTILE", "HIGH"],
        description: "Error correction level (only when type=QR, default: QUARTILE)"
      },
      qrScale: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "Size of each module in pixels (only when type=QR, default: 16)"
      },
      qrVersion: {
        type: "number",
        minimum: 1,
        maximum: 40,
        description: "QR code version (only when type=QR, default: 10)"
      },
      // Barcode Options
      barFormat: {
        type: "string",
        enum: ["PNG", "SVG", "JPG"],
        description: "Image format for barcode (only when type=BARCODE, default: SVG)"
      },
      barModuleWidth: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Barcode module width in pixels (applies when type=BARCODE)"
      },
      barBarHeight: {
        type: "number",
        minimum: 15,
        maximum: 1000,
        description: "Barcode height in pixels (applies when type=BARCODE)"
      },
      barFontSize: {
        type: "number",
        minimum: 0,
        maximum: 24,
        description: "Barcode text font size (applies when type=BARCODE)"
      },
      barHumanReadableLocation: {
        type: "string",
        enum: ["NONE", "BOTTOM", "TOP"],
        description: "Location of human readable text (applies when type=BARCODE)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["role", "account", "friendlyName", "currency"]
  },

  async handler(args) {
    const {
      role,
      account,
      friendlyName,
      type = 'PLAIN',
      amount,
      currency = 'EUR',
      reasonL1,
      reasonL2,
      callbackUrl,
      timeToLive = 120,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      passbackParams,
      // QR Options
      qrFormat,
      qrBorder,
      qrErrorCorrection,
      qrScale,
      qrVersion,
      // Barcode Options
      barFormat,
      barModuleWidth,
      barBarHeight,
      barFontSize,
      barHumanReadableLocation,
      useSandbox = true
    } = args;

    if (!role) {
      throw new Error("role is required and must be either 'SRC' (payer) or 'DST' (payee)");
    }

    if (!account) {
      throw new Error("account is required (unique identifier of the account)");
    }

    if (!friendlyName) {
      throw new Error("friendlyName is required (account holder recognizable name)");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    const result = await createPITransaction({
      role,
      account,
      friendlyName,
      type,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      timeToLive,
      partnerId,
      privateKey,
      passbackParams,
      // QR Options
      qrFormat,
      qrBorder,
      qrErrorCorrection,
      qrScale,
      qrVersion,
      // Barcode Options
      barFormat,
      barModuleWidth,
      barBarHeight,
      barFontSize,
      barHumanReadableLocation,
      useSandbox
    });

    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

    if (result.success) {
      const roleDescription = role === 'SRC' ? 'Payer (Source)' : 'Payee (Destination)';
      const status = result.transaction.status || 'ACTIVE';
      const statusEmoji = '⏳';

      return {
        content: [{
          type: "text",
          text: `🏦 **Payment Institution Transaction Created**

**Transaction Details:**
- ID: ${result.transaction.transactionId || 'N/A'}
- Role: ${roleDescription} (${role})
- Type: ${type}
- Status: ${statusEmoji} ${status}
- Account: ${account}
- Friendly Name: ${friendlyName}
${amount ? `- Amount: ${amount} ${currency}` : '- Amount: Flexible (0.00)'}
${reasonL1 ? `- Description: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}` : ''}
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}
- TTL: ${timeToLive} seconds

**API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions
- Response Status: Success
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
1. Save the transaction ID: \`${result.transaction.transactionId || 'N/A'}\`
2. ${role === 'SRC' ? 'Share transaction ID with payee for processing' : 'Wait for payer to process this transaction'}
3. Use \`payware_pi_get_transaction_status\` to check status
4. Monitor callback notifications (if callback URL provided)
5. ${role === 'SRC' ? 'Complete payment through payware interface' : 'Handle incoming payment processing'}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Payment Institution Transaction Creation Failed**

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions
- Headers: Api-Version=1, Content-Type=application/json

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Troubleshooting:**
1. Verify role is either "SRC" or "DST"
2. Ensure account and friendlyName are provided
3. Check JWT token is valid and not expired
4. Verify partner ID and API access for payment institutions
5. Validate currency code (ISO 3-character)
6. Check sandbox API status`
        }]
      };
    }
  }
};