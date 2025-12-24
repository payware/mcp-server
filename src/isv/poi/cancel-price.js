import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Cancel pending price on a POI via ISV authentication
 * @param {Object} params - Parameters for cancel request
 * @returns {Object} Cancel response
 */
export async function cancelPOIPrice({ poiId, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody: null,
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
    const response = await axios.delete(`${baseUrl}/poi/${poiId}/price`, { headers });

    return {
      success: true,
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
 * Cancel POI price tool implementation for ISV
 */
export const cancelPOIPriceTool = {
  name: "payware_poi_cancel_price",
  description: `Cancel a pending price on a POI, resetting it to IDLE state.

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** DELETE /poi/{poiId}/price
**Use Case:** Cancel a price that was set but customer didn't pay (e.g., order cancelled).

The POI will return to IDLE state and be ready for a new price.

**Required:** POI ID, Merchant Partner ID, and OAuth2 token.`,

  inputSchema: {
    type: "object",
    required: ["poiId", "merchantPartnerId", "oauth2Token"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
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
    const { poiId, merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!poiId) throw new Error("POI ID is required");
    if (!merchantPartnerId) throw new Error("Merchant Partner ID is required");
    if (!oauth2Token) throw new Error("OAuth2 token is required");

    const result = await cancelPOIPrice({ poiId, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      return {
        content: [{
          type: "text",
          text: `✅ **Price Cancelled Successfully**

**POI ID:** ${poiId}
**Status:** 🟢 IDLE (ready for new price)

The POI is now ready to accept a new price.

**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}
**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Cancel Price**

**POI ID:** ${poiId}

**Error:** ${result.error.message}
**Code:** ${result.error.code || 'N/A'}
**Status:** ${result.error.status || 'N/A'}

**Common Issues:**
- INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- POI_NOT_FOUND (404): POI doesn't exist or doesn't belong to merchant
- POI_NO_PENDING_PAYMENT (409): No pending price to cancel (POI already IDLE)

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
