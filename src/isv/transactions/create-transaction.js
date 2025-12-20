import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Create a transaction via payware API on behalf of a merchant (ISV)
 * @param {Object} params - Transaction parameters including ISV authentication
 * @returns {Object} Transaction response
 */
export async function createTransaction({
  // ISV Authentication
  merchantPartnerId,
  oauth2Token,
  // Transaction parameters
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
  // ISV-specific validation
  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  // Standard validation
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

  // Get ISV credentials
  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Create ISV JWT token
  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Use the same JSON serialization method as the JWT factory for MD5 calculation
  const { createMinimizedJSON } = await import('../../core/utils/json-serializer.js');
  const minimizedBodyString = createMinimizedJSON(requestBody);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for MD5 calculation
    const response = await axios.post(`${baseUrl}/transactions`, minimizedBodyString, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      },
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`payware API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

export const createTransactionTool = {
  name: 'payware_operations_create_transaction',
  description: `Create a new transaction through payware as an ISV on behalf of a merchant.

ISV partners can create transactions for merchants they have authorization for via OAuth2.
Requires valid OAuth2 token obtained from the merchant.

**Authentication**: Uses ISV JWT with merchant partner ID in 'aud' claim and OAuth2 token in 'sub' claim.

**Transaction Types:**
- PLAIN: Basic transaction without visual codes
- QR: Transaction with QR code for mobile payments
- BARCODE: Transaction with barcode for scanning

**Required for all transactions:**
- Merchant Partner ID and OAuth2 token (ISV authentication)
- reasonL1 (transaction description)
- amount (transaction value)

**QR Code Options** (when type='QR'):
- qrFormat: PNG, SVG (default: PNG)
- qrBorder: Border width in modules (0-10, default: 4)
- qrErrorCorrection: L, M, Q, H (default: M)
- qrScale: Scale factor (1-10, default: 4)
- qrVersion: QR version (1-40, auto if not specified)

**Barcode Options** (when type='BARCODE'):
- barFormat: CODE128, EAN13, etc.
- barModuleWidth: Width of bars in pixels
- barBarHeight: Height of bars in pixels
- barFontSize: Font size for human readable text
- barHumanReadableLocation: TOP, BOTTOM, NONE`,

  inputSchema: {
    type: 'object',
    required: ['merchantPartnerId', 'oauth2Token', 'reasonL1'],
    properties: {
      // ISV Authentication
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant (8 alphanumeric characters, e.g., "PZAYNMVE")'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
      },

      // Core transaction data
      type: {
        type: 'string',
        enum: ['PLAIN', 'QR', 'BARCODE'],
        default: 'PLAIN',
        description: 'Transaction type'
      },
      amount: {
        type: ['string', 'number'],
        description: 'Transaction amount (e.g., "25.50" or 25.50)'
      },
      currency: {
        type: 'string',
        default: 'EUR',
        description: 'Currency code (ISO 4217, e.g., EUR, USD, GBP)'
      },
      reasonL1: {
        type: 'string',
        description: 'Primary transaction reason/description (required)'
      },
      reasonL2: {
        type: 'string',
        description: 'Secondary transaction reason/description (optional)'
      },

      // Optional transaction metadata
      callbackUrl: {
        type: 'string',
        description: 'URL to receive transaction status updates'
      },
      account: {
        type: 'string',
        description: 'Account identifier'
      },
      friendlyName: {
        type: 'string',
        description: 'Human-readable transaction identifier'
      },
      shop: {
        type: 'string',
        description: 'Shop/location identifier'
      },
      timeToLive: {
        type: 'number',
        default: 120,
        description: 'Transaction validity in minutes'
      },
      passbackParams: {
        type: ['string', 'object'],
        description: 'Additional parameters to pass back in callbacks'
      },

      // QR Code options (when type='QR')
      qrFormat: {
        type: 'string',
        enum: ['PNG', 'SVG'],
        description: 'QR code image format'
      },
      qrBorder: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'QR code border width in modules'
      },
      qrErrorCorrection: {
        type: 'string',
        enum: ['L', 'M', 'Q', 'H'],
        description: 'QR error correction level'
      },
      qrScale: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        description: 'QR code scale factor'
      },
      qrVersion: {
        type: 'number',
        minimum: 1,
        maximum: 40,
        description: 'QR code version (size)'
      },

      // Barcode options (when type='BARCODE')
      barFormat: {
        type: 'string',
        description: 'Barcode format (e.g., CODE128, EAN13)'
      },
      barModuleWidth: {
        type: 'number',
        description: 'Barcode module width in pixels'
      },
      barBarHeight: {
        type: 'number',
        description: 'Barcode height in pixels'
      },
      barFontSize: {
        type: 'number',
        description: 'Font size for human readable text'
      },
      barHumanReadableLocation: {
        type: 'string',
        enum: ['TOP', 'BOTTOM', 'NONE'],
        description: 'Location of human readable text'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler(params) {
    try {
      const result = await createTransaction(params);

      return {
        content: [{
          type: 'text',
          text: `✅ Transaction Created Successfully (ISV -> Merchant: ${params.merchantPartnerId})

📋 **Transaction Details:**
- **Transaction ID**: ${result.transactionId || 'N/A'}
- **Status**: ${result.status || 'CREATED'}
- **Type**: ${params.type}
- **Amount**: ${params.amount || 'N/A'} ${params.currency || 'EUR'}
- **Reason**: ${params.reasonL1}
- **TTL**: ${params.timeToLive || 120} minutes

🔗 **Integration Details:**
- **ISV Partner**: ${getPartnerIdSafe()}
- **Target Merchant**: ${params.merchantPartnerId}
- **OAuth2 Token**: ${params.oauth2Token.substring(0, 8)}...

${result.qrCodeUrl ? `🔲 **QR Code**: ${result.qrCodeUrl}` : ''}
${result.barcodeUrl ? `📊 **Barcode**: ${result.barcodeUrl}` : ''}
${result.paymentUrl ? `💳 **Payment URL**: ${result.paymentUrl}` : ''}

**Raw Response:**
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Transaction Creation Failed

**Error**: ${error.message}

**ISV Authentication Check:**
- Merchant Partner ID: ${params.merchantPartnerId || 'Missing'}
- OAuth2 Token: ${params.oauth2Token ? 'Provided' : 'Missing'}
- ISV Partner ID: ${getPartnerIdSafe()}

**Troubleshooting:**
- Verify OAuth2 token is valid and granted
- Ensure merchant partner ID is correct (8 characters)
- Check transaction parameters meet payware requirements
- Confirm ISV has authorization to act on behalf of merchant`
        }]
      };
    }
  }
};