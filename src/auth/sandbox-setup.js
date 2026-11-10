/**
 * Setup sandbox authentication configuration
 */

import { getPartnerIdSafe, getPrivateKeySafe } from '../config/env.js';
import { LOCAL } from '../shared/tool-annotations.js';

const SANDBOX_CONFIG = {
  baseUrl: 'https://sandbox.payware.eu/api',
  apiVersion: '1',
  environment: 'sandbox',
  // Any ISO 4217 code in payware's currency table: the server checks the table
  // (MerchantValidationService.validateCurrencyExistence, an unknown code is refused). The hand-written
  // list this replaced named codes the table need not hold (BTC, withdrawn ones such as HRK and MRO).
  currencies: 'ISO 4217 codes payware knows; an unknown code is refused',
  supportedTransactionTypes: ['PLAIN', 'QR', 'BARCODE'], // trOptions.type values
  transactionTypes: ['DEFAULT', 'SHIPPABLE'], // transactionType values
  // Up to 36 digits, at the currency's own minor unit (not always two decimals), zero or more.
  amountRule: 'a decimal string at the currency\'s minor unit, zero or more, at most 36 digits',
  maxTTL: 600, // seconds: the default ceiling; payware can raise a merchant's own ceiling
  minTTL: 60, // seconds
  defaultTTL: 120, // seconds, when timeToLive is omitted
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
      requiresContentSha256: 'For POST/PUT/PATCH requests: Base64(SHA-256(body)) in the JWT header',
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
  annotations: LOCAL,
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
      privateKey = getPrivateKeySafe(true)
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
- Currencies: ${config.currencies}
- Amount: ${config.amountRule}
- TTL Range: ${config.minTTL}-${config.maxTTL} seconds unless payware raised your ceiling (default: ${config.defaultTTL})
- Transaction ID Format: Starts with '${config.transactionIdPrefix}'
- QR Options: image format (PNG, JPG, SVG), border 1-10, error correction (LOW, MEDIUM, QUARTILE, HIGH), scale 1-100, version 1-40
- Barcode Options: image format (PNG, JPG, SVG), module width 1-10, bar height 15-1000, font size 0-24, human-readable text location (NONE, BOTTOM, TOP)
- Additional: passbackParams for custom callback data

**API Endpoints:**
- Create Transaction: \`POST ${config.endpoints.createTransaction}\`
- Get Transaction Status: \`GET ${config.endpoints.getTransactionStatus}\`
- Process Transaction: \`POST ${config.endpoints.processTransaction}\` (merchants and payment institutions)
- Cancel Transaction: \`PATCH ${config.endpoints.cancelTransaction}\` (the merchant that created it; the same route finalizes for an institution)
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
- trData.amount: decimal string at the currency's minor unit, zero or more (required by the server; the create tool sends 0.00 when you give none)
- trOptions.type: PLAIN, QR, or BARCODE (default: PLAIN)
- trOptions.timeToLive: 60-600 seconds unless payware raised your ceiling (default: 120)

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