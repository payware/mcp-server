import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Set price on a POI via ISV authentication
 * @param {Object} params - Parameters for set price request
 * @returns {Object} Set price response
 */
export async function setPOIPrice({ poiId, amount, currency, reasonL1, reasonL2, timeToLive, callbackUrl, passbackParams, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }

  if (!amount) {
    throw new Error('Amount is required');
  }

  if (!currency) {
    throw new Error('Currency is required');
  }

  if (!reasonL1) {
    throw new Error('Reason (reasonL1) is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Build request body
  const requestBody = {
    amount: String(amount),
    currency: currency.toUpperCase(),
    reasonL1
  };

  if (reasonL2) requestBody.reasonL2 = reasonL2;
  if (timeToLive) requestBody.timeToLive = timeToLive;
  if (callbackUrl) requestBody.callbackUrl = callbackUrl;
  if (passbackParams) requestBody.passbackParams = passbackParams;

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  const headers = {
    'Authorization': `Bearer ${jwtData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.put(`${baseUrl}/poi/${poiId}/price`, requestBody, { headers });

    return {
      success: true,
      result: response.data,
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
 * Set POI price tool implementation for ISV
 */
export const setPOIPriceTool = {
  name: "payware_poi_set_price",
  description: `Set a pending price on a POI for customer payment.

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** PUT /poi/{poiId}/price
**Use Case:** Set the amount a customer should pay when they scan the POI.

The POI will transition to READY state and wait for a customer scan until the TTL expires.

**Required:** POI ID, amount, currency, reason, Merchant Partner ID, and OAuth2 token.`,

  inputSchema: {
    type: "object",
    required: ["poiId", "amount", "currency", "reasonL1", "merchantPartnerId", "oauth2Token"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
      },
      amount: {
        type: "string",
        description: "Payment amount (e.g., '25.50')"
      },
      currency: {
        type: "string",
        description: "ISO 4217 currency code (e.g., 'EUR', 'USD', 'BGN')"
      },
      reasonL1: {
        type: "string",
        description: "Payment description (e.g., 'Table 5', 'Order #123')"
      },
      reasonL2: {
        type: "string",
        description: "Additional description (optional)"
      },
      timeToLive: {
        type: "integer",
        description: "Seconds until price expires (60-600, default: 120)"
      },
      callbackUrl: {
        type: "string",
        description: "Override callback URL for this payment (optional)"
      },
      passbackParams: {
        type: "string",
        description: "Data to pass back in callback (optional, max 200 chars)"
      },
      merchantPartnerId: {
        type: "string",
        description: "Partner ID of the target merchant (8 alphanumeric characters)"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    }
  },

  async handler(args) {
    const { poiId, amount, currency, reasonL1, reasonL2, timeToLive, callbackUrl, passbackParams, merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!poiId) throw new Error("POI ID is required");
    if (!amount) throw new Error("Amount is required");
    if (!currency) throw new Error("Currency is required");
    if (!reasonL1) throw new Error("Reason (reasonL1) is required");
    if (!merchantPartnerId) throw new Error("Merchant Partner ID is required");
    if (!oauth2Token) throw new Error("OAuth2 token is required");

    const result = await setPOIPrice({
      poiId, amount, currency, reasonL1, reasonL2, timeToLive, callbackUrl, passbackParams,
      merchantPartnerId, oauth2Token, useSandbox
    });

    if (result.success) {
      const data = result.result;

      return {
        content: [{
          type: "text",
          text: `✅ **Price Set Successfully**

**POI ID:** ${data.poiId || poiId}
**Status:** 🟡 ${data.status || 'READY'}

**Payment Details:**
- Amount: **${data.amount || amount} ${data.currency || currency}**
- Reason: ${reasonL1}${reasonL2 ? ` - ${reasonL2}` : ''}

**Session:**
- Token: ${data.sessionToken || 'N/A'}
- Expires: ${data.sessionExpiresAt || 'N/A'}

**Next Steps:**
1. Customer scans the POI (QR code, NFC tag, or barcode)
2. Customer sees the amount and confirms payment
3. You receive a callback when payment completes

**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}
**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Set Price**

**POI ID:** ${poiId}
**Attempted:** ${amount} ${currency}

**Error:** ${result.error.message}
**Code:** ${result.error.code || 'N/A'}
**Status:** ${result.error.status || 'N/A'}

**Common Issues:**
- INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- POI_NOT_FOUND (404): POI doesn't exist or doesn't belong to merchant
- POI_DISABLED (409): POI is disabled
- POI_NOT_IDLE (409): POI already has a pending price (cancel it first)
- INVALID_AMOUNT (400): Check amount format (e.g., '25.50')
- UNKNOWN_CURRENCY (400): Invalid currency code

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
