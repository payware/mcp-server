import { getProducts } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * List products tool implementation for ISVs
 */
export const listProductsTool = {
  name: "payware_products_list_products",
  description: "Get a list of all products for a merchant account (ISV operation)",

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
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token"]
  },

  async handler(args) {
    const {
      merchantPartnerId,
      oauth2Token,
      useSandbox = true
    } = args;

    // ISV validation
    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required for ISV operations");
    }

    // Get ISV credentials
    const isvPartnerId = getPartnerIdSafe();
    const privateKey = getPrivateKeySafe();

    if (!isvPartnerId) {
      throw new Error("ISV Partner ID is required. Set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Set environment-specific private key variable.");
    }

    try {
      const result = await getProducts({
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
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
          text: `📦 **Products List (ISV -> Merchant: ${merchantPartnerId})**

**Summary:**
- Total Products: ${productCount}
- Environment: ${useSandbox ? 'Sandbox' : 'Production'}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

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

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}

**Troubleshooting:**
1. Verify OAuth2 token is valid and not expired
2. Ensure merchant partner ID is correct (8 characters)
3. Confirm ISV has authorization to act on behalf of merchant
4. Check private key matches public key registered with payware`
        }]
      };
    }
  }
};