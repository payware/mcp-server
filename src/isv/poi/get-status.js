import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get POI status via ISV authentication
 * @param {Object} params - Parameters for status request
 * @returns {Object} POI status response
 */
export async function getPOIStatus({ poiId, merchantPartnerId, oauth2Token, useSandbox = true }) {
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
    const response = await axios.get(`${baseUrl}/poi/${poiId}/status`, { headers });

    return {
      success: true,
      status: response.data,
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
 * Get POI status tool implementation for ISV
 */
export const getPOIStatusTool = {
  name: "payware_poi_get_status",
  description: `Get current status of a POI including any pending payment.

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** GET /poi/{poiId}/status
**Use Case:** Check if a POI is idle, has a pending price, or is busy with a payment.

**POI States:**
- IDLE: Ready for new payment
- READY: Price set, waiting for customer scan
- BUSY: Payment in progress
- DISABLED: Not accepting payments

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
      throw new Error("Merchant Partner ID is required");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required");
    }

    const result = await getPOIStatus({ poiId, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const status = result.status;
      const statusEmoji = {
        'IDLE': '🟢',
        'READY': '🟡',
        'BUSY': '🔴',
        'DISABLED': '⚫'
      }[status.status] || '⚪';

      let pendingInfo = '';
      if (status.status === 'READY' || status.status === 'BUSY') {
        pendingInfo = `
**Pending Payment:**
- Amount: ${status.pendingAmount} ${status.pendingCurrency}
- Expires: ${status.sessionExpiresAt || 'N/A'}${status.transactionId ? `\n- Transaction: ${status.transactionId}` : ''}`;
      }

      return {
        content: [{
          type: "text",
          text: `${statusEmoji} **POI Status: ${status.status}**

**POI ID:** ${status.poiId}
**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}
${pendingInfo}

**Status Meaning:**
${status.status === 'IDLE' ? '✅ POI is ready to accept a new price' : ''}${status.status === 'READY' ? '⏳ Price set, waiting for customer to scan' : ''}${status.status === 'BUSY' ? '🔄 Customer scanned, payment in progress' : ''}${status.status === 'DISABLED' ? '🚫 POI is disabled and cannot accept payments' : ''}

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get POI Status**

**POI ID:** ${poiId}
**Error:** ${result.error.message}
**Status:** ${result.error.status || 'N/A'}

**Common Issues:**
- INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- POI_NOT_FOUND (404): POI doesn't exist

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
