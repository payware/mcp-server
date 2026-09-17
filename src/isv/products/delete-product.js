import { deleteProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Delete product tool implementation for ISVs
 */
export const deleteProductTool = {
  name: "payware_products_delete_product",
  description: "Delete a product from a merchant account (ISV operation). This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      // ISV Authentication
      merchantPartnerId: {
        type: "string",
        description: "Target merchant partner ID (8 alphanumeric characters, e.g., 'PZAYNMVE')"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
      },
      productId: {
        type: "string",
        description: "Product identifier to delete (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId"]
  },

  async handler(args) {
    const {
      merchantPartnerId,
      oauth2Token,
      productId,
      useSandbox = true
    } = args;

    // ISV validation
    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required for ISV operations");
    }

    if (!productId) {
      throw new Error("Product ID is required");
    }

    // Get ISV credentials
    const isvPartnerId = getPartnerIdSafe();
    const privateKey = getPrivateKeySafe();

    if (!isvPartnerId || !privateKey) {
      throw new Error("ISV credentials are required");
    }

    try {
      const result = await deleteProduct({
        productId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      return {
        content: [{
          type: "text",
          text: `🗑️ **Product Deleted Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Deleted Product:**
- ID: ${productId}
- Status: Successfully removed from merchant account

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Any associated price schedules and audios have also been deleted
⚠️ Active transactions using this product may be affected`
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

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}`
        }]
      };
    }
  }
};