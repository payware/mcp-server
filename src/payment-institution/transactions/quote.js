import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';

/**
 * Quote: re-price an offer without side effects (GET /api/transactions/{id}/quote, institutions only).
 *
 * The first read of a product or placement id records an impression; a payer who then picks a country
 * or changes the quantity needs the price again, and reading the offer again would record again. The
 * quote answers the same question with no impression and no attribution
 * (strategy/product/agentic-commerce-implementation-spec.md, 22.3).
 */
export async function getQuote({ transactionId, deliveryCountry, quantity, partnerId, privateKey, useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // A GET carries no body, so no contentSha256.
  const tokenData = createJWTToken(partnerId, privateKey, null);
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions/${encodeURIComponent(transactionId)}/quote`, {
      headers,
      ...((deliveryCountry || quantity !== undefined) && {
        params: {
          ...(deliveryCountry && { deliveryCountry }),
          ...(quantity !== undefined && { quantity })
        }
      })
    });
    return {
      success: true,
      quote: response.data,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

export const quoteTool = {
  name: 'payware_fi_quote',
  annotations: READS,
  description: `Re-price an offer as a financial institution, with no side effects: the lines and total for a quantity and a delivery country. Use it after the payer picks a country or changes the quantity, instead of reading the offer again (a repeat read records the product view again; a quote records nothing and attributes nothing).

**Endpoint:** GET /transactions/{id}/quote  (institutions only)

**Works for** \`pr\`, \`pl\`, \`ps\` and \`pa\` ids. \`deliveryCountry\` (ISO 3166-1 alpha-2, e.g. BG) and \`quantity\` (1-99, default 1) are as on the offer read; \`quantity\` is ignored for a \`pa\`, whose lines are fixed. **For a \`pa\` the quote prices the country you give**, while the offer read prices a session that holds an address for that address's country: quote when your payer delivers somewhere else, and send that total. A session is re-priced for your payer's country, never refused for its price, whoever entered its address. Any other id prefix is 400 \`ERR_INVALID_TRANSACTION_ID\`; an unknown or inactive product 404 \`ERR_MISSING_PRODUCT\`; a session 404 \`ERR_SESSION_NOT_FOUND\` or \`ERR_SESSION_EXPIRED\`.

**Returns** \`transactionId\`, \`currency\`, \`quantity\` (not for a \`pa\`), \`deliveryCountry\` and \`countryServed\` (when a country was given and something is shipped), \`items\`, \`total\` and, for shippable products, \`delivery\`:
- \`items\`: ITEM lines (\`productId\`, \`name\`, \`quantity\`, \`unitPrice\`, \`amount\`) and, when the product is shippable and the country is served, a SHIPPING line named "Delivery" with its \`country\` (the amount may be 0.00). Translate lines by \`type\`, never by \`name\`.
- \`total\`: the sum of the lines: **the amount to send when processing** with the same \`quantity\`, plus the payer's tip if you send one (\`tip\`, where \`tipsAllowed\` is true; the quote carries \`tipsAllowed\` and \`deliveryDetails\` as the offer read does). A different amount is 409 \`ERR_AMOUNT_NOT_TOTAL\`.
- \`countryServed: false\`: the shop or the product does not deliver there; processing for that country is 409 \`ERR_DELIVERY_COUNTRY_NOT_SERVED\`. \`delivery.countries\` lists every country served with its delivery amount for these lines (absent when the shop has no table: any country, no delivery charge).
- A product priced 0.00 (the payer sets the amount) has no \`items\` or \`total\`: the quote carries only \`delivery\`, whose \`countries\` are the countries served **without amounts**, and \`countryServed\` for the country you gave.

Next: process with \`payware_operations_process_transaction\`, sending the same \`quantity\`, \`deliveryAddress.country\` and \`amount\` = \`total\` (+ \`tip\`).`,
  inputSchema: {
    type: 'object',
    properties: {
      transactionId: {
        type: 'string',
        description: "The id to quote: 'pr' (product), 'pl' (placement), 'ps' (soundbite) or 'pa' (an agent purchase session). Not a pw or pi id",
        pattern: '^(pr|pl|ps|pa)[0-9A-Za-z]{8,30}$'
      },
      deliveryCountry: {
        type: 'string',
        description: 'ISO 3166-1 alpha-2 code, e.g. BG, of the country the delivery is priced for. Else 400 ERR_INVALID_DELIVERY_COUNTRY',
        pattern: '^[A-Za-z]{2}$'
      },
      quantity: {
        type: 'integer',
        description: 'How many units, 1-99, default 1 (ignored for a pa). Else 400 ERR_INVALID_QUANTITY',
        minimum: 1,
        maximum: 99
      },
      partnerId: {
        type: 'string',
        description: 'Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.',
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: 'string',
        description: 'RSA private key for JWT token creation. Uses environment-specific private key as default.'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    },
    required: ['transactionId']
  },

  async handler(args) {
    const {
      transactionId,
      deliveryCountry,
      quantity,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }

    const result = await getQuote({ transactionId, deliveryCountry, quantity, partnerId, privateKey, useSandbox });

    if (!result.success) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Quote Failed**

**Transaction ID:** ${transactionId}

- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}

**Common causes:** ERR_INVALID_DELIVERY_COUNTRY and ERR_INVALID_QUANTITY (400), ERR_INVALID_TRANSACTION_ID (400: only pr, pl, ps and pa can be quoted), ERR_MISSING_PRODUCT, ERR_SESSION_NOT_FOUND or ERR_SESSION_EXPIRED (404).

**Timestamp:** ${result.timestamp}`
        }]
      };
    }

    const q = result.quote;
    const lines = Array.isArray(q.items)
      ? q.items.map(i => `- ${i.type} ${i.name}${i.country ? ` (${i.country})` : ''}${i.quantity ? ` x${i.quantity}` : ''}: ${i.amount} ${q.currency || ''}`).join('\n')
      : '';
    return {
      content: [{
        type: 'text',
        text: `🧮 **Quote for ${q.transactionId || transactionId}**

${q.deliveryCountry ? `- Delivery country: ${q.deliveryCountry} (${q.countryServed === false ? 'NOT served: processing would be refused with ERR_DELIVERY_COUNTRY_NOT_SERVED' : 'served'})\n` : ''}- Quantity: ${q.quantity ?? 'N/A'}
${lines}
**Total: ${q.total} ${q.currency || ''}** (send this as \`amount\` when processing)

\`\`\`json
${JSON.stringify(q, null, 2)}
\`\`\`

No impression was recorded.
**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};
