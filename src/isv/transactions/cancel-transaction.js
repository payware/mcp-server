import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Cancel a transaction via payware API as an ISV
 */
export async function cancelTransaction({ transactionId, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  const requestBody = {}; // Empty body for cancel

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Use the same JSON serialization method as the JWT factory for SHA-256 calculation
  const { createMinimizedJSON } = await import('../../core/utils/json-serializer.js');
  const minimizedBodyString = createMinimizedJSON(requestBody);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const response = await axios.delete(`${baseUrl}/transactions/${transactionId}`, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      },
      data: minimizedBodyString,
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

export const cancelTransactionTool = {
  name: 'payware_operations_cancel_transaction',
  description: `Cancel an active transaction as an ISV on behalf of a merchant.

Requires ISV authentication with merchant partner ID and OAuth2 token.
Only ACTIVE transactions can be cancelled.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId', 'merchantPartnerId', 'oauth2Token'],
    properties: {
      transactionId: {
        type: 'string',
        description: 'Transaction ID to cancel'
      },
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
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
      const result = await cancelTransaction(params);

      return {
        content: [{
          type: 'text',
          text: `✅ Transaction Cancelled Successfully (ISV -> Merchant: ${params.merchantPartnerId})

📋 **Cancellation Details:**
- **Transaction ID**: ${params.transactionId}
- **Status**: ${result.status || 'CANCELLED'}
- **ISV Partner**: ${getPartnerIdSafe()}
- **Target Merchant**: ${params.merchantPartnerId}

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
          text: `❌ Transaction Cancellation Failed

**Error**: ${error.message}

**ISV Authentication:**
- Merchant Partner ID: ${params.merchantPartnerId}
- OAuth2 Token: ${params.oauth2Token ? 'Provided' : 'Missing'}
- ISV Partner ID: ${getPartnerIdSafe()}`
        }]
      };
    }
  }
};