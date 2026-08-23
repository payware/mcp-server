import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../../shared/api-errors.js';

/**
 * Cancel a transaction via payware API as an ISV
 */
export async function cancelTransaction({ transactionId, statusMessage, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  // Required by the server, not optional politeness: MerchantValidationService throws
  // MissingStatusMessageException when an ACTIVE transaction is cancelled without one, and that
  // path is the ISV path too - it explicitly resolves the acting merchant through the on-behalf ISV.
  if (!statusMessage) {
    throw new Error('statusMessage is required when cancelling (server: ERR_MISSING_STATUS_MESSAGE)');
  }
  if (statusMessage.length > 100) {
    throw new Error('statusMessage cannot exceed 100 characters');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // PATCH with a status body, matching the merchant tool and the server.
  //
  // This used to be `axios.delete` against `/transactions/{id}` with an empty body. There is no
  // DELETE /transactions/{id} on the server - TransactionController has DELETE only on
  // /{transactionId}/link - so the call could never have succeeded, and the empty body carried
  // neither the CANCELLED status nor the status message the validator demands. Three separate
  // reasons it could not work, which is why it is a rewrite rather than a patch.
  const requestBody = {
    status: 'CANCELLED',
    statusMessage
  };

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
    throw describeApiError(error, 'call the payware API');
  }
}

export const cancelTransactionTool = {
  name: 'payware_operations_cancel_transaction',
  description: `Cancel an active transaction as an ISV on behalf of a merchant.

**Endpoint:** PATCH /transactions/{transactionId} with \`{"status":"CANCELLED","statusMessage":"..."}\`

Requires ISV authentication with merchant partner ID and OAuth2 token.
Only ACTIVE transactions can be cancelled - one already processed answers 409 ERR_ALREADY_PROCESSED.

**\`statusMessage\` is mandatory.** The server rejects a cancellation without one
(ERR_MISSING_STATUS_MESSAGE); it is the reason shown to the merchant and recorded against the
transaction. Max 100 characters.

**You can cancel only what you initiated.** An ISV's own transactions include those it created on
behalf of this merchant; anything else answers 403 ERR_UNAUTHORIZED_OPERATION.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId', 'statusMessage', 'merchantPartnerId', 'oauth2Token'],
    properties: {
      transactionId: {
        type: 'string',
        description: 'Transaction ID to cancel'
      },
      statusMessage: {
        type: 'string',
        description: 'Reason for the cancellation. REQUIRED - the server rejects a cancellation without one (ERR_MISSING_STATUS_MESSAGE). Max 100 characters.',
        maxLength: 100
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