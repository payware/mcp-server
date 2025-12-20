import { getProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get product tool implementation for ISVs
 */
export const getProductTool = {
  name: "payware_products_get_product",
  description: "Get detailed information about a specific product by ID (ISV operation)",

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
        description: "Product identifier (starts with 'pr')",
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

    if (!isvPartnerId) {
      throw new Error("ISV Partner ID is required. Set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Set environment-specific private key variable.");
    }

    try {
      const result = await getProduct({
        productId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const product = result.data;

      return {
        content: [{
          type: "text",
          text: `📦 **Product Details (ISV -> Merchant: ${merchantPartnerId})**

**Basic Information:**
- ID: ${product.productId}
- Name: ${product.name}
- Type: ${product.type}
- Status: ${product.active ? '✅ Active' : '⏸️ Inactive'}
- Shop: ${product.shopCode} (${product.shopName})

**Description:**
${product.shortDescription ? `- Short: ${product.shortDescription}` : ''}
${product.longDescription ? `- Long: ${product.longDescription}` : ''}

**Identifiers:**
${product.sku ? `- SKU: ${product.sku}` : ''}
${product.upc ? `- UPC: ${product.upc}` : ''}

**Pricing:**
- Regular Price: ${product.regularPrice} ${product.currencyCode}
- Current Sale Price: ${product.salePrice} ${product.currencyCode}
- Time to Live: ${product.timeToLive} seconds

**Settings:**
- Shippable: ${product.shippable ? 'Yes (requires delivery address)' : 'No (digital product)'}

**Active Period:**
- From: ${product.activeFromZoned || product.activeFrom}
- To: ${product.activeToZoned || product.activeTo}
- Timezone: ${product.timeZone}

**Resources:**
${product.imageUrl ? `- Image: ${product.imageUrl}` : ''}
${product.termsUrl ? `- Terms URL: ${product.termsUrl}` : ''}
${product.termsText ? `- Terms Text: ${product.termsText.substring(0, 100)}${product.termsText.length > 100 ? '...' : ''}` : ''}
${product.deepLink && product.deepLink !== '-' ? `- Deep Link: ${product.deepLink}` : ''}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**API Response:**
\`\`\`json
${JSON.stringify(product, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Available Actions:**
- \`payware_products_update_product\` - Update this product
- \`payware_products_delete_product\` - Delete this product
- \`payware_products_get_product_image\` - Generate QR/barcode image
- \`payware_products_get_schedules\` - View price schedules
- \`payware_products_get_audios\` - View registered audios`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Product**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}

**Troubleshooting:**
1. Verify the product ID is correct and starts with 'pr'
2. Ensure the product exists and belongs to the target merchant
3. Check OAuth2 token validity and permissions
4. Confirm ISV has authorization to access merchant's products`
        }]
      };
    }
  }
};