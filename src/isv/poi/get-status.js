import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';

/**
 * Get POI status via ISV authentication
 * @param {Object} params - Parameters for status request
 * @returns {Object} POI status response
 */
export async function getPOIStatus({ poiId, sessionToken, merchantPartnerId, oauth2Token, useSandbox = true }) {
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
    // The session token pins one sale: with it the response also carries that session's
    // transactionId and transactionStatus. A GET is signed without a body, so the query string is free.
    const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
    const response = await axios.get(`${baseUrl}/poi/${poiId}/status${query}`, { headers });

    return {
      success: true,
      status: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Get POI status tool implementation for ISV
 */
export const getPOIStatusTool = {
  name: "payware_poi_get_status",
  description: `Get the current status of a POI and the outcome of its sales.

**ISV Authentication:** Uses ISV JWT with merchant partner ID and OAuth2 token.
**Endpoint:** GET /poi/{poiId}/status[?sessionToken=...]
**Use Case:** Follow a sale to its outcome - the backup to callbacks, and on Basic (no transaction
endpoints) the only way when a callback is lost or there is no backend.

**POI States:**
- IDLE: no pending price and no sale running
- READY: price set, waiting for a scan (wins over BUSY: the POI can take the next price while a sale runs)
- BUSY: a customer scanned and the sale is running

**Every response** carries lastTransactionId / lastTransactionStatus - the POI's most recent sale, running
(ACTIVE) or finished (CONFIRMED, DECLINED, FAILED, CANCELLED, EXPIRED). Once the POI is back to IDLE,
lastTransactionStatus is how the last sale ended.

**With sessionToken** (from payware_poi_set_price) the response also carries transactionId /
transactionStatus for exactly that sale - use it when the POI may be re-armed before the previous sale
finishes. Poll every 2-3 seconds and stop at a final status; the read is rate limited.

**Required:** POI ID, Merchant Partner ID, and OAuth2 token.`,

  inputSchema: {
    type: "object",
    required: ["poiId", "merchantPartnerId", "oauth2Token"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
      },
      sessionToken: {
        type: "string",
        description: "Optional. The sessionToken returned by payware_poi_set_price; returns that sale's transaction and status"
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
    const { poiId, sessionToken, merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!poiId) {
      throw new Error("POI ID is required");
    }

    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required");
    }

    const result = await getPOIStatus({ poiId, sessionToken, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const status = result.status;
      const statusEmoji = {
        'IDLE': '🟢',
        'READY': '🟡',
        'BUSY': '🔴'
      }[status.status] || '⚪';
      const meaning = {
        'IDLE': status.lastTransactionId
          ? `No sale running. The last sale ended ${status.lastTransactionStatus}.`
          : 'No sale running, and the POI has not had a sale yet.',
        'READY': 'Price set, waiting for a customer to scan.',
        'BUSY': 'A customer scanned and the sale is running.'
      }[status.status] || '';

      const pendingInfo = status.status === 'READY' ? `
**Pending Price:**
- Amount: ${status.pendingAmount} ${status.pendingCurrency}
- Session expires: ${status.sessionExpiresAt || 'N/A'}` : '';

      const lastSale = status.lastTransactionId ? `
**Last Sale:** ${status.lastTransactionId} - ${status.lastTransactionStatus}` : '';

      const pinnedSale = sessionToken ? `
**Sale for this session token:** ${status.transactionId
          ? `${status.transactionId} - ${status.transactionStatus}`
          : 'not scanned yet (or the token does not belong to this POI)'}` : '';

      return {
        content: [{
          type: "text",
          text: `${statusEmoji} **POI Status: ${status.status}**

**POI ID:** ${status.poiId}
**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}
${pendingInfo}${lastSale}${pinnedSale}

**Meaning:** ${meaning}

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
- ERR_INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- ERR_POI_NOT_FOUND (404): POI doesn't exist, or is disabled
- ERR_SHOP_NOT_IN_SCOPE (403): the POI's shop is not assigned to you

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
