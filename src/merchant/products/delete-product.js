import { deleteProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Delete product tool implementation for merchants
 */
export const deleteProductTool = {
  name: "payware_products_delete_product",
  description: "Delete a product from the merchant account. This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier to delete (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId"]
  },

  async handler(args) {
    const {
      productId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId) {
      throw new Error("Product ID is required");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set environment-specific private key variable.");
    }

    try {
      const result = await deleteProduct({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      return {
        content: [{
          type: "text",
          text: `🗑️ **Product Deleted Successfully**

**Deleted Product:**
- ID: ${productId}
- Status: Successfully removed from account

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Any associated price schedules and audios have also been deleted
⚠️ Active transactions using this product may be affected

**Next Steps:**
- Use \`payware_products_list_products\` to view remaining products
- Create new products with \`payware_products_create_product\`
- Check active transactions that may have used this product`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Product Deletion Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}

**Troubleshooting:**
1. Verify the product ID is correct and exists
2. Ensure the product belongs to your account
3. Check if the product is currently in use by active transactions
4. Verify JWT token is valid and not expired
5. Ensure proper API access permissions`
        }]
      };
    }
  }
};