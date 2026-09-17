import { getProducts } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * List products tool implementation for merchants
 */
export const listProductsTool = {
  name: "payware_products_list_products",
  description: "Get a list of all products for the merchant account",

  inputSchema: {
    type: "object",
    properties: {
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
    required: []
  },

  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set environment-specific private key variable.");
    }

    try {
      const result = await getProducts({
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const products = result.data;
      const productCount = Array.isArray(products) ? products.length : 0;

      let productsList = '';
      if (Array.isArray(products) && products.length > 0) {
        productsList = products.map(product =>
          `- **${product.name}** (${product.productId})
  - Type: ${product.type} | Price: ${product.salePrice} ${product.currencyCode}
  - Status: ${product.active ? '✅ Active' : '⏸️ Inactive'} | Shop: ${product.shopCode}
  - TTL: ${product.timeToLive}s | ${product.shippable ? 'Shippable' : 'Digital'}`
        ).join('\n\n');
      } else {
        productsList = 'No products found.';
      }

      return {
        content: [{
          type: "text",
          text: `📦 **Products List**

**Summary:**
- Total Products: ${productCount}
- Environment: ${useSandbox ? 'Sandbox' : 'Production'}

**Products:**
${productsList}

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Available Actions:**
- \`payware_products_get_product\` - Get detailed product information
- \`payware_products_create_product\` - Create a new product
- \`payware_products_update_product\` - Update existing product
- \`payware_products_delete_product\` - Delete a product`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to List Products**

**Error Details:**
- Message: ${error.message}

**Troubleshooting:**
1. Verify JWT token is valid and not expired
2. Ensure private key matches public key registered with payware
3. Verify partner ID and API access
4. Check sandbox API status`
        }]
      };
    }
  }
};