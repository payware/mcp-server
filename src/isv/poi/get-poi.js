import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get POI details via ISV authentication
 * @param {Object} params - Parameters for get request
 * @returns {Object} POI details response
 */
export async function getPOI({ poiId, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }

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
    const response = await axios.get(`${baseUrl}/poi/${poiId}`, { headers });

    return {
      success: true,
      poi: response.data,
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
 * Get POI details tool implementation for ISV
 */
export const getPOITool = {
  name: "payware_poi_get",
  description: `Get details of a specific POI (Point of Interaction).

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** GET /poi/{poiId}
**Use Case:** Retrieve full details of a physical payment point including configuration and current state.

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

    if (!poiId) {
      throw new Error("POI ID is required");
    }

    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required for ISV operations");
    }

    const result = await getPOI({ poiId, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const poi = result.poi;
      const statusEmoji = {
        'IDLE': '🟢',
        'READY': '🟡',
        'BUSY': '🔴',
        'DISABLED': '⚫'
      }[poi.status] || '⚪';

      return {
        content: [{
          type: "text",
          text: `📍 **POI Details Retrieved (ISV -> Merchant: ${merchantPartnerId})**

**POI:** ${poi.name} (${poi.poiId})
**Status:** ${statusEmoji} ${poi.status}
**Active:** ${poi.isActive ? '✅ Yes' : '❌ No'}

**Location:**
- Shop: ${poi.shopName || 'N/A'} (${poi.shopCode || 'N/A'})

**Configuration:**
- Default TTL: ${poi.ttlSeconds || 120} seconds
- Callback URL: ${poi.callbackUrl || 'Not configured'}
- Linked vPOS: ${poi.linkedVposCount || 0} terminals

**Current Session:**
${poi.status !== 'IDLE' && poi.pendingAmount ? `- Amount: ${poi.pendingAmount} ${poi.pendingCurrency}
- Expires: ${poi.sessionExpiresAt || 'N/A'}
- Token: ${poi.sessionToken || 'N/A'}` : '- No active session'}

**Timestamps:**
- Created: ${poi.createdAt || 'N/A'}
- Updated: ${poi.updatedAt || 'N/A'}

**Full Response:**
\`\`\`json
${JSON.stringify(poi, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get POI Details**

**POI ID:** ${poiId}
**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Troubleshooting:**
1. Verify POI ID format (must be pi + 8 alphanumeric chars, e.g., piABC12345)
2. If 400 error: POI ID format is invalid (ERR_INVALID_POI_ID)
3. If 404 error: POI not found or doesn't belong to merchant
4. Check OAuth2 token validity

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
