import { getProductDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get deep link for a product (ISV on behalf of merchant)
 */
export const getProductLinkTool = {
  name: "payware_deep_links_get_product_link",
  description: `Get an active deep link for a product on behalf of a merchant. Returns a clickable URL that redirects to the payware mobile app.

**ISV Authentication:**
- Requires ISV JWT token with merchant partner ID in 'aud' claim
- Requires OAuth2 token in 'sub' claim

**Deep Link Format:**
- Web URL: https://go.payware.eu/{productId}
- Mobile Redirect: payware://{productId}

**Use Cases:**
- Mobile-only e-commerce product references
- Advertisement links to products
- Product sharing via messaging

**Important Notes:**
- Deep links are only supported in production environment
- Link expiration is synchronized with the referenced product
- Traditional deep links that route to app content when app is installed`,

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The product identifier (e.g., 'pr7e4rCToG')",
        pattern: "^[a-zA-Z0-9]+$"
      },
      merchantPartnerId: {
        type: "string",
        description: "Partner ID of the merchant for whom the product is being retrieved"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token for merchant authorization"
      },
      isvPartnerId: {
        type: "string",
        description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "ISV RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["productId", "merchantPartnerId", "oauth2Token"]
  },

  async handler(args) {
    const {
      productId,
      merchantPartnerId,
      oauth2Token,
      isvPartnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!productId) {
      throw new Error("productId is required");
    }

    if (!merchantPartnerId) {
      throw new Error("merchantPartnerId is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("oauth2Token is required for ISV operations");
    }

    if (!isvPartnerId) {
      throw new Error("ISV Partner ID is required. Provide via 'isvPartnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    try {
      const result = await getProductDeepLink({
        productId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token
      });

      // Extract the URL - API returns either string directly or object with link property
      const linkUrl = typeof result.data === 'string' ? result.data : (result.data.link || result.data)

      return {
        content: [{
          type: "text",
          text: `🔗 **Product Deep Link Retrieved (ISV)**

**Deep Link Details:**
- Product ID: ${productId}
- Merchant: ${merchantPartnerId}
- Web URL: ${linkUrl}
- Mobile Redirect: payware://${productId}

**ISV Authentication:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 10)}...

**Link Information:**
- Status: Active
- Expiration: Synchronized with product
- Platform: Production only

**API Response:**
\`\`\`json
${JSON.stringify(result.data, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: GET ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}
- Method: ${result.requestInfo.method}

**Usage:**
1. Share the web URL: \`${linkUrl}\`
2. On mobile devices, it will redirect to: \`payware://${productId}\`
3. Link expires when the product expires
4. Recreate if product is updated`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Product Deep Link (ISV)**

**Error Details:**
- Product ID: ${productId}
- Merchant: ${merchantPartnerId}
- Message: ${error.message}

**Common Issues:**
1. **Product not found**: Check if product exists and is not expired
2. **Authentication failed**: Verify ISV partner ID, private key, and OAuth2 token
3. **Authorization failed**: Ensure OAuth2 token authorizes access to merchant
4. **Sandbox environment**: Deep links are production-only
5. **Invalid product ID**: Ensure product ID format is correct

**Troubleshooting:**
1. Verify product exists in merchant's payware dashboard
2. Check OAuth2 token is valid and not expired
3. Ensure ISV has permission to access merchant data
4. Check if running in production environment
5. Ensure JWT authentication is working`
        }]
      };
    }
  }
};