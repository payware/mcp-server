import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';

/**
 * Set price on a POI via ISV authentication
 * @param {Object} params - Parameters for set price request
 * @returns {Object} Set price response
 */
export async function setPOIPrice({ poiId, amount, currency, ttlSeconds, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }

  if (!amount) {
    throw new Error('Amount is required');
  }

  if (!currency) {
    throw new Error('Currency is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // amount, currency and ttlSeconds are the only fields the server reads (POIPriceRequest); anything
  // else is ignored without an error. This used to send reasonL1 (and demand it), reasonL2,
  // timeToLive, callbackUrl and passbackParams - none of which the server has - so a caller relying
  // on the per-price callbackUrl got no callbacks at all. The callback URL belongs to the POI.
  const requestBody = {
    amount: String(amount),
    currency: currency.toUpperCase()
  };

  if (ttlSeconds) requestBody.ttlSeconds = ttlSeconds;

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
    return apiErrorResult(error);
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

The POI moves to READY and waits for a scan until the TTL expires. The scan creates the transaction and
the POI is BUSY until the sale is final.

**Only amount, currency and ttlSeconds are accepted.** There is no description, callback URL or passback
field on a price - the callback URL is set on the POI when it is created, and a POI without one sends no
callbacks.

**Keep the returned sessionToken** until the sale has a final status: pass it to
payware_poi_get_status to read that sale's transaction and outcome.

**Required:** POI ID, amount, currency, Merchant Partner ID, and OAuth2 token.`,

  inputSchema: {
    type: "object",
    required: ["poiId", "amount", "currency", "merchantPartnerId", "oauth2Token"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
      },
      amount: {
        type: "string",
        description: "Payment amount (e.g., '25.50'), positive and no finer than the currency's smallest unit"
      },
      currency: {
        type: "string",
        description: "ISO 4217 currency code (e.g., 'EUR', 'USD', 'GBP')"
      },
      ttlSeconds: {
        type: "integer",
        description: "Seconds until the price expires if nobody scans it (60-600). Defaults to the POI's own ttlSeconds."
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
    const { poiId, amount, currency, ttlSeconds, merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!poiId) throw new Error("POI ID is required");
    if (!amount) throw new Error("Amount is required");
    if (!currency) throw new Error("Currency is required");
    if (!merchantPartnerId) throw new Error("Merchant Partner ID is required");
    if (!oauth2Token) throw new Error("OAuth2 token is required");

    const result = await setPOIPrice({
      poiId, amount, currency, ttlSeconds, merchantPartnerId, oauth2Token, useSandbox
    });

    if (result.success) {
      const data = result.result;

      return {
        content: [{
          type: "text",
          text: `✅ **Price Set Successfully**

**POI ID:** ${data.poiId || poiId}
**Status:** 🟡 ${data.status || 'READY'}
**Amount:** ${amount} ${currency.toUpperCase()}

**Session:**
- Token: ${data.sessionToken || 'N/A'} - keep it until the sale is final
- Price expires if not scanned: ${data.expiresAt || 'N/A'}

**Next Steps:**
1. The customer scans the POI (QR code, NFC tag or BLE); the transaction is created and the POI is BUSY
2. Outcome by callback, if the POI has a callbackUrl: poi.scanned with the transaction id, then TRANSACTION_FINALIZED with the final status (both carry the poiId)
3. Or poll payware_poi_get_status every 2-3 seconds with this sessionToken until transactionStatus is final
4. To cancel, use payware_poi_cancel_price - possible only before the scan

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
- ERR_INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- ERR_POI_NOT_FOUND (404): POI doesn't exist or doesn't belong to the merchant
- ERR_SHOP_NOT_IN_SCOPE (403): the POI's shop is not assigned to you
- ERR_POI_DISABLED (409): POI is disabled
- ERR_POI_ALREADY_HAS_PENDING_PRICE (409): POI already has a pending price (cancel it first)
- ERR_INVALID_AMOUNT (400): amount finer than the currency's smallest unit
- ERR_MISSING_CURRENCY (400): currency missing or unknown
- ERR_VALIDATION_FAILED (400): amount missing or not positive, or ttlSeconds outside 60-600

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
