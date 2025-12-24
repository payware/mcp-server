import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * List all POIs for a merchant via ISV authentication
 * @param {Object} params - Parameters for list request
 * @returns {Object} List of POIs response
 */
export async function listPOIs({ merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  // Get ISV credentials
  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Create ISV JWT token (GET request - no body)
  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody: null,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${jwtData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/poi`, { headers });

    return {
      success: true,
      pois: response.data,
      count: Array.isArray(response.data) ? response.data.length : 0,
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
 * List POIs tool implementation for ISV
 */
export const listPOIsTool = {
  name: "payware_poi_list",
  description: `List all POIs (Points of Interaction) for a merchant.

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** GET /poi
**Use Case:** Retrieve all physical payment points configured for a merchant.

POI states: IDLE (ready), READY (price set), BUSY (payment in progress), DISABLED.

**Required:** Merchant Partner ID and OAuth2 token for ISV authentication.`,

  inputSchema: {
    type: "object",
    required: ["merchantPartnerId", "oauth2Token"],
    properties: {
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
    const { merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required for ISV operations");
    }

    const result = await listPOIs({ merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const poisList = result.pois.map(poi => {
        const statusEmoji = {
          'IDLE': '🟢',
          'READY': '🟡',
          'BUSY': '🔴',
          'DISABLED': '⚫'
        }[poi.status] || '⚪';

        return `${statusEmoji} **${poi.name}** (${poi.poiId})
   Shop: ${poi.shopName || poi.shopCode}
   Status: ${poi.status}${poi.pendingAmount && poi.pendingAmount !== '0.00' ? ` | Pending: ${poi.pendingAmount} ${poi.pendingCurrency}` : ''}`;
      }).join('\n\n');

      return {
        content: [{
          type: "text",
          text: `📍 **POIs Retrieved (ISV -> Merchant: ${merchantPartnerId})**

**Total POIs:** ${result.count}

${poisList || 'No POIs found for this merchant.'}

**Status Legend:**
🟢 IDLE - Ready for new payment
🟡 READY - Price set, waiting for customer
🔴 BUSY - Payment in progress
⚫ DISABLED - Not accepting payments

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to List POIs**

**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Troubleshooting:**
1. Verify OAuth2 token is valid
2. Ensure merchant has POI feature enabled
3. Check ISV authorization for merchant

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
