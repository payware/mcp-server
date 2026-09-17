import { deleteProductDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Delete deep link for a merchant product
 */
export const deleteProductLinkTool = {
  name: "payware_deep_links_delete_product_link",
  description: `Delete an active deep link for a product. Once deleted, the deep link URL will no longer redirect to the payware mobile app.

**Use Cases:**
- Remove expired product links
- Clean up after product removal
- Security cleanup for discontinued products

**Important Notes:**
- Deep links are only supported in production environment
- Once deleted, the link cannot be recovered - you'll need to create a new one
- This operation is irreversible`,

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
      const result = await deleteProductDeepLink({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Product Deep Link Deleted**

**Deletion Details:**
- Product ID: ${productId}
- Status: Successfully deleted
- Link URL: https://go.payware.eu/${productId} (now inactive)

**API Call Details:**
- Endpoint: DELETE ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}
- Method: ${result.requestInfo.method}

**Result:**
- The deep link is no longer active
- Mobile redirects will no longer work
- URL will return an error if accessed

**Important Notes:**
⚠️ This operation is irreversible
⚠️ Create a new link if needed using \`payware_deep_links_get_product_link\`
⚠️ Any existing shared links will stop working immediately`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Delete Product Deep Link**

**Error Details:**
- Product ID: ${productId}
- Message: ${error.message}

**Common Issues:**
1. **Link not found**: Deep link may already be deleted or never existed
2. **Authentication failed**: Verify partner ID and private key
3. **Sandbox environment**: Deep links are production-only
4. **Invalid product ID**: Ensure product ID format is correct

**Troubleshooting:**
1. Check if deep link exists using \`payware_deep_links_get_product_link\`
2. Verify running in production environment
3. Ensure JWT authentication is working
4. Confirm product ID is correct`
        }]
      };
    }
  }
};