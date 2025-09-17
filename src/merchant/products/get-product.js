import { getProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get product tool implementation for merchants
 */
export const getProductTool = {
  name: "payware_products_get_product",
  description: "Get detailed information about a specific product by ID",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
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
      const result = await getProduct({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const product = result.data;

      return {
        content: [{
          type: "text",
          text: `📦 **Product Details**

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

**Troubleshooting:**
1. Verify the product ID is correct and starts with 'pr'
2. Ensure the product exists and belongs to your account
3. Check JWT token validity
4. Verify partner ID and API access`
        }]
      };
    }
  }
};