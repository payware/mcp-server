import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Process (finalize) a transaction via payware API as an ISV
 */
export async function processTransaction({ transactionId, merchantPartnerId, oauth2Token, action = 'CONFIRMED', useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  if (!['CONFIRMED', 'DECLINED'].includes(action)) {
    throw new Error('Action must be either CONFIRMED or DECLINED');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  const requestBody = { action };

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Use the same JSON serialization method as the JWT factory for MD5 calculation
  const { createMinimizedJSON } = await import('../../core/utils/json-serializer.js');
  const minimizedBodyString = createMinimizedJSON(requestBody);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for MD5 calculation
    const response = await axios.patch(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      },
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

export const processTransactionTool = {
  name: 'payware_operations_process_transaction',
  description: `Process (finalize) a transaction as an ISV on behalf of a merchant.

Allows confirming or declining a transaction. Only ACTIVE transactions can be processed.
Requires ISV authentication with merchant partner ID and OAuth2 token.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId', 'merchantPartnerId', 'oauth2Token'],
    properties: {
      transactionId: {
        type: 'string',
        description: 'Transaction ID to process'
      },
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
      },
      action: {
        type: 'string',
        enum: ['CONFIRMED', 'DECLINED'],
        default: 'CONFIRMED',
        description: 'Action to perform on the transaction'
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
      const result = await processTransaction(params);

      const actionEmoji = params.action === 'CONFIRMED' ? '✅' : '❌';

      return {
        content: [{
          type: 'text',
          text: `${actionEmoji} Transaction ${params.action} Successfully (ISV -> Merchant: ${params.merchantPartnerId})

📋 **Processing Details:**
- **Transaction ID**: ${params.transactionId}
- **Action**: ${params.action}
- **New Status**: ${result.status || params.action}
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
          text: `❌ Transaction Processing Failed

**Error**: ${error.message}

**Processing Attempt:**
- Transaction ID: ${params.transactionId}
- Action: ${params.action}
- Merchant: ${params.merchantPartnerId}

**ISV Authentication:**
- OAuth2 Token: ${params.oauth2Token ? 'Provided' : 'Missing'}
- ISV Partner ID: ${getPartnerIdSafe()}`
        }]
      };
    }
  }
};