import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../../shared/api-errors.js';

/**
 * Get one completed transaction as an ISV acting on behalf of a merchant.
 *
 * **This used to be a list-and-filter tool, and there is nothing on the server to list.**
 * It built `GET /transactions-history?limit=50&offset=0&status=...&from=...&to=...` and read
 * `result.transactions` / `result.totalCount` off the response. `TransactionHistoryController` maps
 * exactly one route - `GET /api/transactions-history/{transactionId}` - so the bare path matched no
 * handler and the call answered 404 every time, whatever the filters said. The filters, the
 * pagination and the result shape were all describing an endpoint that has never existed.
 *
 * It now does what the merchant tool does and what the API offers: fetch one transaction by id.
 */
export async function getTransactionHistory({
  merchantPartnerId,
  oauth2Token,
  transactionId,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error(
      'transactionId is required. The payware API has no endpoint that lists or filters transaction ' +
      'history - GET /transactions-history/{transactionId} fetches one transaction by id, and that ' +
      'is the whole surface. Keep your own record of the ids you created, or read them from the ' +
      'callbacks you received.'
    );
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // GET, so no body and no content hash.
  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody: null,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions-history/${transactionId}`, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      }
    });

    return response.data;
  } catch (error) {
    throw describeApiError(error, 'call the payware API');
  }
}

export const getTransactionHistoryTool = {
  name: 'payware_operations_get_transaction_history',
  description: `Get one completed or expired transaction as an ISV on behalf of a merchant.

**Endpoint:** GET /transactions-history/{transactionId}

Returns a transaction in a final state: CONFIRMED, DECLINED, FAILED, EXPIRED or CANCELLED. For a
transaction still ACTIVE, use \`payware_operations_get_transaction_status\` instead - the two
endpoints cover disjoint sets of transactions and neither falls back to the other.

⚠️ **There is no way to list or search transaction history.** This endpoint takes an id and returns
that one transaction. There is no pagination, no date range and no status filter anywhere in the
payware API - so keep your own record of the transaction ids you created, or read them from the
callbacks you received. (This tool previously advertised \`limit\`, \`offset\`, \`status\`, \`from\` and
\`to\` parameters; they described an endpoint that does not exist and every call 404'd.)

📦 **This is the only source of the delivery address.** For a SHIPPABLE transaction,
\`deliveryAddress\` is returned here and nowhere else - it was removed from the finalized callback on
2026-08-07, because a callback goes to whatever certificate the merchant's endpoint presents and a
shopper's home address does not belong on that channel. The callback tells you the shipment is
ready; this call gives you the address.

⚠️ **The MERCHANT's plan governs, and this endpoint is now gated.** It was ungated until 2026-08-21
and now requires Standard or Premium, so acting for a **Basic** merchant answers **403**.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId', 'merchantPartnerId', 'oauth2Token'],
    properties: {
      transactionId: {
        type: 'string',
        description: 'The transaction to fetch, e.g. "pw7e4rCToG". Required - there is no list or search endpoint.'
      },
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant (8 alphanumeric characters)'
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
      const tx = await getTransactionHistory(params);

      const statusEmojis = {
        CONFIRMED: '✅',
        DECLINED: '❌',
        FAILED: '⚠️',
        EXPIRED: '⏰',
        CANCELLED: '🚫'
      };
      const emoji = statusEmojis[tx.status] || '❓';

      const delivery = tx.deliveryAddress ? `

📦 **Delivery Address** (SHIPPABLE)
- Name: ${tx.deliveryAddress.fullName || 'N/A'}
- Address: ${tx.deliveryAddress.streetAddressLine1 || 'N/A'}${tx.deliveryAddress.streetAddressLine2 ? `, ${tx.deliveryAddress.streetAddressLine2}` : ''}
- City: ${tx.deliveryAddress.city || 'N/A'}, ${tx.deliveryAddress.zipCode || 'N/A'}
- Region: ${tx.deliveryAddress.region || 'N/A'}
- Country: ${tx.deliveryAddress.country || 'N/A'}
- Phone: ${tx.deliveryAddress.phoneNumber || 'N/A'}
- Email: ${tx.deliveryAddress.email || 'N/A'}` : '';

      return {
        content: [{
          type: 'text',
          text: `${emoji} **Transaction ${tx.transactionId || params.transactionId}** - ${tx.status}

**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${params.merchantPartnerId}

- Amount: ${tx.amount ?? 'N/A'} ${tx.currency ?? ''}
- Fee: ${tx.fee ?? '(not reported - absence means unknown, not zero)'}
- Type: ${tx.transactionType ?? 'N/A'}
- Payment method: ${tx.paymentMethod ?? 'N/A'}
- Status message: ${tx.statusMessage ?? 'N/A'}
- Created: ${tx.created ?? 'N/A'}
- Finalized: ${tx.finalized ?? '(absent - EXPIRED transactions carry no finalization moment)'}${delivery}

**Raw Response:**
\`\`\`json
${JSON.stringify(tx, null, 2)}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Transaction History Request Failed

**Error**: ${error.message}

**ISV Authentication:**
- Merchant Partner ID: ${params.merchantPartnerId}
- OAuth2 Token: ${params.oauth2Token ? 'Provided' : 'Missing'}
- ISV Partner ID: ${getPartnerIdSafe()}

**Common causes:**
- 404: the transaction is still ACTIVE (use \`payware_operations_get_transaction_status\`), or the id is wrong.
- 403: the acting merchant is on the Basic plan, which does not include transaction history.`
        }]
      };
    }
  }
};
