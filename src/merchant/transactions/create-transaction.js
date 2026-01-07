import axios from 'axios';
import { createJWTToken, generateContentMd5 } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Create a transaction via payware API
 * @param {Object} params - Transaction parameters
 * @returns {Object} Transaction response
 */
export async function createTransaction({
  type = 'PLAIN',
  amount,
  currency = 'EUR',
  reasonL1,
  reasonL2,
  callbackUrl,
  account,
  friendlyName,
  shop,
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
  if (!reasonL1) {
    throw new Error('reasonL1 is required (transaction grounds description)');
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
  
  // Build request body according to documentation structure
  const requestBody = {
    ...(account && { account }),
    ...(friendlyName && { friendlyName }),
    ...(shop && { shop }),
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { 
      passbackParams: typeof passbackParams === 'string' ? passbackParams : JSON.stringify(passbackParams) 
    }),
    trData: {
      amount: amount !== undefined ? amount.toString() : '0.00',
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    trOptions: {
      type,
      timeToLive
    },
    ...(type === 'QR' && Object.keys(qrOptions).length > 0 && { qrOptions }),
    ...(type === 'BARCODE' && Object.keys(barOptions).length > 0 && { barOptions })
  };
  
  // Convert to deterministic minimized JSON as required by payware API for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (POST requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);
  
  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1' // Required: current API version
  };
  
  try {
    
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    // This ensures the server calculates the same SHA-256 hash
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
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
    // Provide helpful error message for hash mismatches
    let enhancedMessage = error.response?.data?.message || error.message;

    if (error.response?.data?.code === 'ERR_INVALID_CONTENT_HASH' ||
        enhancedMessage?.includes('SHA-256') ||
        enhancedMessage?.includes('contentSha256')) {
      enhancedMessage = `Hash Mismatch Error: The contentSha256 in JWT header doesn't match the request body.

Cause: Different JSON strings were used for JWT contentSha256 calculation and HTTP body.
Solution: Ensure the EXACT same compact JSON string is used for both purposes.

Original error: ${enhancedMessage}`;
    }

    return {
      success: false,
      error: {
        message: enhancedMessage,
        status: error.response?.status,
        code: error.response?.data?.code,
        details: error.response?.data,
        helpUrl: error.response?.data?.code === 'ERR_INVALID_CONTENT_HASH' ?
          'https://github.com/payware/mcp-server#sha256-consistency' : undefined
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Create transaction tool implementation
 */
export const createTransactionTool = {
  name: "payware_operations_create_transaction",
  description: `Create a new payware transaction. Parameters map to the following API structure:

📋 **ROOT LEVEL** (Transaction metadata):
- shop, account, friendlyName, callbackUrl, passbackParams

💰 **TRANSACTION DATA** (trData object):
- amount, currency, reasonL1, reasonL2

⚙️ **TRANSACTION OPTIONS** (trOptions object):
- type, timeToLive

📱 **QR OPTIONS** (qrOptions object - only when type=QR):
- qrFormat, qrBorder, qrErrorCorrection, qrScale, qrVersion

🔗 **BARCODE OPTIONS** (barOptions object - only when type=BARCODE):
- barFormat, barModuleWidth, barBarHeight, barFontSize, barHumanReadableLocation

🔐 **AUTHENTICATION** (not sent to API, used for JWT signing):
- partnerId, privateKey

**Actual API Request Structure:**
\`\`\`json
{
  "shop": "...",
  "account": "...",
  "friendlyName": "...",
  "callbackUrl": "...",
  "passbackParams": "...",
  "trData": {
    "amount": "25.50",
    "currency": "EUR", 
    "reasonL1": "...",
    "reasonL2": "..."
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
      type: {
        type: "string",
        enum: ["PLAIN", "QR", "BARCODE"],
        description: "Transaction type"
      },
      amount: {
        type: "number", 
        description: "Amount as currency value (e.g., 25.50 for €25.50 or '15.75' for $15.75). Can be 0 for amount-flexible transactions. Max 36 chars including decimals",
        minimum: 0,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code)"
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
        description: "📋 ROOT LEVEL: Account identifier (if not supplied, determined from payware portal)",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "📋 ROOT LEVEL: Account holder recognizable name (if not supplied, merchant alias is used)",
        maxLength: 100
      },
      shop: {
        type: "string",
        description: "📋 ROOT LEVEL: Shop code (if not supplied, default shop is used)", 
        maxLength: 10
      },
      timeToLive: {
        type: "number",
        description: "⚙️ TRANSACTION OPTIONS: Time allowed for payment initiation in seconds",
        minimum: 60,
        maximum: 600
      },
      callbackUrl: {
        type: "string",
        description: "📋 ROOT LEVEL: HTTPS URL to receive transaction status callbacks (must be https://)",
        format: "uri"
      },
      partnerId: {
        type: "string",
        description: "🔐 AUTHENTICATION: Partner ID from payware dashboard (not sent in API request). Uses PAYWARE_PARTNER_ID env var as default."
      },
      privateKey: {
        type: "string",
        description: "🔐 AUTHENTICATION: RSA private key for JWT token creation (not sent in API request). Accepts PEM format with/without headers or raw base64 content. Uses environment-specific private key as default."
      },
      passbackParams: {
        type: "string",
        description: "📋 ROOT LEVEL: Additional parameters passed back in callbacks (max 200 chars)",
        maxLength: 200
      },
      // QR Code Options
      qrFormat: {
        type: "string",
        enum: ["PNG", "JPEG", "GIF", "BMP", "SVG"],
        description: "📱 QR OPTIONS: Image format for QR code (only when type=QR, default: SVG)"
      },
      qrBorder: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "📱 QR OPTIONS: Border size in modules around QR code (only when type=QR, default: 4)"
      },
      qrErrorCorrection: {
        type: "string",
        enum: ["LOW", "MEDIUM", "QUARTILE", "HIGH"],
        description: "📱 QR OPTIONS: Error correction level - LOW (7%), MEDIUM (15%), QUARTILE (25%), HIGH (30%) (only when type=QR, default: QUARTILE)"
      },
      qrScale: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "📱 QR OPTIONS: Size of each module in pixels, irrelevant for SVG (only when type=QR, default: 16)"
      },
      qrVersion: {
        type: "number",
        minimum: 1,
        maximum: 40,
        description: "📱 QR OPTIONS: QR code version, higher versions can store more data (only when type=QR, default: 10)"
      },
      // Barcode Options
      barFormat: {
        type: "string",
        enum: ["PNG", "SVG", "JPG"],
        description: "🔗 BARCODE OPTIONS: Image format for barcode (only when type=BARCODE, default: SVG)"
      },
      barModuleWidth: {
        type: "number",
        minimum: 1,
        maximum: 5,
        description: "Barcode module width in pixels (applies when type=BARCODE)"
      },
      barBarHeight: {
        type: "number",
        minimum: 10,
        maximum: 200,
        description: "Barcode height in pixels (applies when type=BARCODE)"
      },
      barFontSize: {
        type: "number",
        minimum: 8,
        maximum: 24,
        description: "Barcode text font size (applies when type=BARCODE)"
      },
      barHumanReadableLocation: {
        type: "string",
        enum: ["TOP", "BOTTOM", "NONE"],
        description: "Location of human readable text (applies when type=BARCODE)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing"
      }
    },
    required: ["currency", "reasonL1"],
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      type = 'PLAIN',
      amount,
      currency = 'EUR',
      reasonL1,
      reasonL2,
      callbackUrl,
      account,
      friendlyName,
      shop,
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
    
    if (!reasonL1) {
      throw new Error("reasonL1 is required (transaction grounds description)");
    }
    
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }
    
    const result = await createTransaction({
      type,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      account,
      friendlyName,
      shop,
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
      // New transactions are always ACTIVE when created
      const status = result.transaction.status || 'ACTIVE';
      const statusEmoji = '⏳';

      return {
        content: [{
          type: "text",
          text: `💳 **Transaction Created Successfully**

**Transaction Details:**
- ID: ${result.transaction.transactionId || 'N/A'}
- Type: ${type}
- Status: ${statusEmoji} ${status}
- Amount: ${amount} ${currency}
- Description: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}

**API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions
- Response Status: ${result.transaction ? 'Success' : 'Failed'}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
1. Save the transaction ID: \`${result.transaction.transactionId || 'N/A'}\`
2. Use \`payware_transactions_get_transaction_status\` to check status
3. Wait for callback notification (if callback URL provided)
4. Process payment through payware interface`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Creation Failed**

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
1. Verify JWT token is valid and not expired
2. Check transaction parameters (amount, type, currency)
3. Ensure private key matches public key registered with payware
4. Verify partner ID and API access
5. Check sandbox API status`
        }]
      };
    }
  }
};