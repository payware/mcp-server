import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get transaction history from payware API as an ISV
 */
export async function getTransactionHistory({
  merchantPartnerId,
  oauth2Token,
  partnerId,
  transactionId,
  limit = 50,
  offset = 0,
  status,
  from,
  to,
  useSandbox = true
}) {
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

  const params = new URLSearchParams();
  if (partnerId) params.append('partnerId', partnerId);
  if (transactionId) params.append('transactionId', transactionId);
  if (limit) params.append('limit', limit.toString());
  if (offset) params.append('offset', offset.toString());
  if (status) params.append('status', status);
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const url = `${baseUrl}/transactions-history?${params.toString()}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`payware API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

export const getTransactionHistoryTool = {
  name: 'payware_operations_get_transaction_history',
  description: `Get transaction history as an ISV on behalf of a merchant.

Retrieves both active and completed transactions with optional filtering.
Requires ISV authentication with merchant partner ID and OAuth2 token.`,

  inputSchema: {
    type: 'object',
    required: ['merchantPartnerId', 'oauth2Token'],
    properties: {
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
      },
      partnerId: {
        type: 'string',
        description: 'Filter by partner ID (optional)'
      },
      transactionId: {
        type: 'string',
        description: 'Filter by specific transaction ID (optional)'
      },
      limit: {
        type: 'number',
        default: 50,
        description: 'Maximum number of results to return'
      },
      offset: {
        type: 'number',
        default: 0,
        description: 'Number of results to skip for pagination'
      },
      status: {
        type: 'string',
        enum: ['ACTIVE', 'CONFIRMED', 'DECLINED', 'FAILED', 'EXPIRED', 'CANCELLED'],
        description: 'Filter by transaction status'
      },
      from: {
        type: 'string',
        description: 'Start date for filtering (YYYY-MM-DD format)'
      },
      to: {
        type: 'string',
        description: 'End date for filtering (YYYY-MM-DD format)'
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
      const result = await getTransactionHistory(params);

      const transactions = result.transactions || [];
      const totalCount = result.totalCount || transactions.length;

      const formatTransaction = (tx) => {
        const statusEmojis = {
          'ACTIVE': '⏳',
          'CONFIRMED': '✅',
          'DECLINED': '❌',
          'FAILED': '⚠️',
          'EXPIRED': '⏰',
          'CANCELLED': '🚫'
        };
        const emoji = statusEmojis[tx.status] || '❓';
        const paymentInfo = tx.paymentMethod ? ` [${tx.paymentMethod}]` : '';
        return `  ${emoji} **${tx.id}** - ${tx.trData?.amount || '0.00'} ${tx.trData?.currency || 'EUR'}${paymentInfo} - ${tx.status} - ${tx.createdAt || 'N/A'}`;
      };

      return {
        content: [{
          type: 'text',
          text: `📈 **Transaction History Retrieved (ISV -> Merchant: ${params.merchantPartnerId})**

**ISV Integration:**
- ISV Partner: ${getPartnerIdSafe()}
- Target Merchant: ${params.merchantPartnerId}
- OAuth2 Token: ${params.oauth2Token.substring(0, 8)}...

**Results:** ${transactions.length} of ${totalCount} transactions

**Transactions:**
${transactions.length > 0 ? transactions.map(formatTransaction).join('\n') : '  No transactions found'}

**Applied Filters:**
${params.status ? `- Status: ${params.status}\n` : ''}${params.from ? `- From: ${params.from}\n` : ''}${params.to ? `- To: ${params.to}\n` : ''}${params.limit ? `- Limit: ${params.limit}\n` : ''}${params.offset ? `- Offset: ${params.offset}\n` : ''}

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
          text: `❌ Transaction History Request Failed

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