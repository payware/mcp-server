/**
 * Setup sandbox authentication configuration
 */

import { getPartnerIdSafe, getPrivateKeySafe } from '../config/env.js';

const SANDBOX_CONFIG = {
  baseUrl: 'https://sandbox.payware.eu/api',
  apiVersion: '1',
  environment: 'sandbox',
  supportedCurrencies: [
    // Major currencies
    'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'SEK', 'NOK', 'DKK',
    // All other supported currencies (100+ total)
    'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AWG', 'AZN',
    'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTC', 'BTN', 'BWP', 'BYN', 'BZD',
    'CDF', 'CLP', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
    'DJF', 'DOP', 'DZD',
    'EGP', 'ERN', 'ETB',
    'FJD', 'FKP',
    'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
    'HKD', 'HNL', 'HRK', 'HTG', 'HUF',
    'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
    'JMD', 'JOD',
    'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
    'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
    'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRO', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
    'NAD', 'NGN', 'NIO', 'NPR', 'NZD',
    'OMR',
    'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
    'QAR',
    'RON', 'RSD', 'RUB', 'RWF',
    'SAR', 'SBD', 'SCR', 'SDG', 'SGD', 'SHP', 'SLL', 'SOS', 'SRD', 'STD', 'SVC', 'SYP', 'SZL',
    'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
    'UAH', 'UGX', 'UYU', 'UZS',
    'VND', 'VUV',
    'WST',
    'XAF', 'XCD', 'XOF', 'XPF',
    'YER',
    'ZAR', 'ZMW', 'ZWL'
  ], // ISO 3-character codes
  supportedTransactionTypes: ['PLAIN', 'QR', 'BARCODE'], // trOptions.type values
  transactionTypes: ['DEFAULT', 'SHIPPABLE'], // transactionType values
  maxAmount: 'Unlimited', // Limited by Java type implementation
  minAmount: '0.00', // Zero allowed for flexible amounts
  maxTTL: 600, // seconds
  minTTL: 60, // seconds
  defaultTTL: 120, // seconds
  audience: 'https://payware.eu', // Required JWT audience
  transactionIdPrefix: 'pw' // All transaction IDs start with 'pw'
};

/**
 * Generate sandbox configuration
 * @param {string} partnerId - Partner ID
 * @param {string} privateKey - Private key (optional, for validation)
 * @returns {Object} Sandbox configuration object
 */
export function generateSandboxConfig(partnerId, privateKey = null) {
  const config = {
    ...SANDBOX_CONFIG,
    partnerId,
    endpoints: {
      createTransaction: `${SANDBOX_CONFIG.baseUrl}/transactions`,
      getTransactionStatus: `${SANDBOX_CONFIG.baseUrl}/transactions/{id}`,
      processTransaction: `${SANDBOX_CONFIG.baseUrl}/transactions/{id}`,
      cancelTransaction: `${SANDBOX_CONFIG.baseUrl}/transactions/{id}`,
      getTransactionHistory: `${SANDBOX_CONFIG.baseUrl}/transactions-history/{id}`,
      callback: 'https://your-callback-url' // Provided by merchant
    },
    headers: {
      'Content-Type': 'application/json',
      'Api-Version': '1'
    },
    authentication: {
      type: 'JWT',
      algorithm: 'RS256',
      audience: 'https://payware.eu',
      requiresContentMd5: 'For POST/PUT/PATCH requests',
      hasPrivateKey: !!privateKey
    },
    generatedAt: new Date().toISOString()
  };

  return config;
}

/**
 * Setup sandbox auth tool implementation  
 */
export const setupSandboxAuthTool = {
  name: "payware_authentication_setup_sandbox_auth",
  description: "Setup sandbox authentication configuration for payware API",
  inputSchema: {
    type: "object",
    properties: {
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default."
      },
      privateKey: {
        type: "string",
        description: "RSA private key in PEM format (optional, for validation). Uses environment-specific private key as default."
      }
    },
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    
    const config = generateSandboxConfig(partnerId, privateKey);
    
    return {
      content: [{
        type: "text", 
        text: `🔧 **Sandbox Authentication Setup Complete**

**Configuration:**
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

**Environment Details:**
- Base URL: ${config.baseUrl}
- API Version: ${config.apiVersion}  
- Environment: ${config.environment}
- Partner ID: ${config.partnerId}

**Supported Features:**
- Request Types (trOptions.type): ${config.supportedTransactionTypes.join(', ')}
- Transaction Types: ${config.transactionTypes.join(', ')}
- Currencies: ${config.supportedCurrencies.join(', ')} (ISO 3-char codes)
- Amount Range: €${config.minAmount} - ${config.maxAmount} (currency values)
- TTL Range: ${config.minTTL}-${config.maxTTL} seconds (default: ${config.defaultTTL})
- Transaction ID Format: Starts with '${config.transactionIdPrefix}'
- QR Options: Format (PNG/JPEG/SVG), Border, Error Correction (L/M/Q/H), Scale, Version
- Barcode Options: Format (CODE128/CODE39/EAN13), Width, Height, Font Size, Text Location
- Additional: passbackParams for custom callback data

**API Endpoints:**
- Create Transaction: \`POST ${config.endpoints.createTransaction}\`
- Get Transaction Status: \`GET ${config.endpoints.getTransactionStatus}\`
- Process Transaction: \`POST ${config.endpoints.processTransaction}\` (merchants only)
- Cancel Transaction: \`PATCH ${config.endpoints.cancelTransaction}\` (creators only)
- Transaction History: \`GET ${config.endpoints.getTransactionHistory}\` (completed/expired)
- Callback Endpoint: \`POST [your-callback-url]\` (configured by you)

**Required Headers (All Requests):**
${Object.entries(config.headers).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
- Authorization: Bearer {JWT_TOKEN} (with contentSha256 for POST/PATCH)

**JWT Requirements:**
- Algorithm: RS256
- Issuer (iss): Your Partner ID
- Audience (aud): https://payware.eu
- Content-SHA256: Required in JWT header for POST/PATCH requests
- Private Key: RSA 2048-bit minimum

**Required Fields for Transaction Creation:**
- trData.currency: ISO 3-character code (required)
- trData.reasonL1: Description, max 100 chars (required)
- trData.reasonL2: Continuation, max 100 chars (optional)
- trData.amount: Currency value as string/number, 0.00+ (optional for flexible)
- trOptions.type: PLAIN, QR, or BARCODE (default: PLAIN)
- trOptions.timeToLive: 60-600 seconds (default: 120)

**Next Steps:**
1. Generate RSA key pair (2048-bit minimum)
2. Register public key in payware portal
3. Create JWT token with proper structure
4. Test with create transaction endpoint
5. Implement callback handler for status updates

**⚠️ Sandbox Only:**
This configuration is for sandbox testing only. Do not use in production.`
      }]
    };
  }
};