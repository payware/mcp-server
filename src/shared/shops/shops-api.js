import axios from 'axios';
import { createAuthHeaders } from '../auth-headers.js';
import { apiErrorResult } from '../api-errors.js';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';

/**
 * Shops - the merchant outlets a transaction, product or POI belongs to.
 *
 * `shopCode` is required or defaulted on most write paths in this server (creating a transaction,
 * creating a product, creating a POI, batching POIs), and until now nothing here could tell you what
 * a valid one was. An assistant had two options: leave `shop` out and hope the merchant's default is
 * the right outlet, or invent a code and get a 400. Listing them is one GET.
 */

/**
 * List the shops the caller can act on.
 *
 * @param {Object} params
 * @param {string} params.partnerType 'merchant' | 'isv'
 * @param {boolean} params.useSandbox
 * @returns {Object} { success, shops, count, requestId, timestamp } or an apiErrorResult
 */
export async function listShops({ partnerType, useSandbox = true, ...authParams }) {
  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/shops`, { headers });

    return {
      success: true,
      shops: response.data,
      count: Array.isArray(response.data) ? response.data.length : 0,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Shared list-shops tool. Registered for both the merchant and ISV roles; `partnerType` decides how
 * the request is signed and, on the server side, whose shops come back.
 */
export function buildListShopsTool({ partnerType, resolveAuth }) {
  const isIsv = partnerType === 'isv';

  return {
    name: 'payware_shops_list',
    description: `List the merchant outlets (shops) the caller can act on.

**Endpoint:** GET /shops

**Use this before any call that takes a \`shop\` / \`shopCode\`.** Creating a transaction, creating a
product, creating a POI and batching POIs all take one, and an invalid code is a 400
(\`ERR_INVALID_SHOP_CODE\`). Omitting it falls back to the merchant's default shop, which is a
reasonable guess for a single-outlet merchant and the wrong outlet for everyone else - the sale lands
against the wrong shop, and nothing about the response says so.

**Returned per shop:** \`shopCode\` (the value to pass), \`name\`, and the address/contact fields the
merchant configured.
${isIsv ? `
⚠️ **ISVs see only their assigned shops.** This returns the shops the merchant put in your scope, not
every shop the merchant owns. That is deliberate and it is the same rule the write paths enforce:
naming a shop outside your scope answers **403 \`ERR_SHOP_NOT_IN_SCOPE\`**. So if a shop you expect is
missing here, the merchant has not assigned it - ask them to, rather than passing the code anyway.

⚠️ **The MERCHANT's plan governs.** An on-behalf call inherits the acting merchant's plan, so this
answers **403** when that merchant is on **Basic**.
` : `
⚠️ **Requires Standard or Premium.** A Basic merchant gets **403**.
`}
**Note on financial institutions:** banks do not own shops. A bank principal calling this gets 403,
not an empty list.`,

    inputSchema: {
      type: 'object',
      required: isIsv ? ['merchantPartnerId', 'oauth2Token'] : [],
      properties: {
        ...(isIsv
          ? {
              merchantPartnerId: {
                type: 'string',
                description: 'Partner ID of the target merchant (8 alphanumeric characters)'
              },
              oauth2Token: {
                type: 'string',
                description: 'OAuth2 access token obtained from the merchant'
              }
            }
          : {
              partnerId: {
                type: 'string',
                description: 'Partner ID from the payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.'
              },
              privateKey: {
                type: 'string',
                description: 'RSA private key for JWT signing. Uses the environment-specific key as default.'
              }
            }),
        useSandbox: {
          type: 'boolean',
          description: 'Use sandbox environment for testing',
          default: true
        }
      }
    },

    async handler(args) {
      const { useSandbox = true } = args;
      const authParams = resolveAuth(args);
      const result = await listShops({ partnerType, useSandbox, ...authParams });

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `❌ **Failed to List Shops**

- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}
${result.error.correlationId ? `- Correlation ID: ${result.error.correlationId}` : ''}
${result.error.guidance ? `\n${result.error.guidance}` : ''}

**Timestamp:** ${result.timestamp}`
          }]
        };
      }

      const shops = Array.isArray(result.shops) ? result.shops : [];
      const list = shops.map(shop => {
        const location = [shop.city, shop.country].filter(Boolean).join(', ');
        return `🏬 **${shop.name || '(unnamed)'}** - \`${shop.shopCode}\`${location ? `\n   ${location}` : ''}`;
      }).join('\n');

      return {
        content: [{
          type: 'text',
          text: `🏬 **Shops (${result.count})**

${list || 'No shops returned.'}

Pass a \`shopCode\` above as the \`shop\` parameter when creating a transaction, product or POI.
${shops.length === 0 ? `
**An empty list is not necessarily an error.**${isIsv ? ' As an ISV you see only the shops this merchant assigned to your scope - an empty list means none have been assigned yet.' : ' It means no shop is configured for this merchant yet.'}` : ''}

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  };
}
