import { getProductDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get deep link for a merchant product
 */
export const getProductLinkTool = {
  name: "payware_deep_links_get_product_link",
  description: `Get an active deep link for a product. Returns a clickable URL that redirects to the payware mobile app.

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
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["productId"]
  },

  async handler(args) {
    const {
      productId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!productId) {
      throw new Error("productId is required");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    try {
      const result = await getProductDeepLink({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      // Extract the URL - API returns either string directly or object with link property
      const linkUrl = typeof result.data === 'string' ? result.data : (result.data.link || result.data)

      return {
        content: [{
          type: "text",
          text: `🔗 **Product Deep Link Retrieved**

**Deep Link Details:**
- Product ID: ${productId}
- Web URL: ${linkUrl}
- Mobile Redirect: payware://${productId}

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
          text: `❌ **Failed to Get Product Deep Link**

**Error Details:**
- Product ID: ${productId}
- Message: ${error.message}

**Common Issues:**
1. **Product not found**: Check if product exists and is not expired
2. **Authentication failed**: Verify partner ID and private key
3. **Sandbox environment**: Deep links are production-only
4. **Invalid product ID**: Ensure product ID format is correct

**Troubleshooting:**
1. Verify product exists in your payware dashboard
2. Check if running in production environment
3. Ensure JWT authentication is working
4. Confirm product is active and not expired`
        }]
      };
    }
  }
};