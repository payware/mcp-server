import { updateProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { PRODUCT_TYPES, OVERLAP_PRIORITY } from '../../shared/products/products-api.js';

/**
 * Update product tool implementation for merchants
 */
export const updateProductTool = {
  name: "payware_products_update_product",
  description: `Update an existing product. Only provide the fields you want to change.

**Product Structure:**
📦 **PRODUCT METADATA**: name, shortDescription, longDescription, sku, upc, shippable, active, shop
💰 **PRODUCT DATA** (prData object): type, regularPrice, currency, overlapPriority, timeToLive, activeFrom, activeTo, timeZone
⚙️ **PRODUCT OPTIONS** (prOptions object): imageUrl, termsUrl, termsText`,

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier to update (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      name: {
        type: "string",
        description: "Product recognizable name",
        maxLength: 50
      },
      shortDescription: {
        type: "string",
        description: "Short product description",
        maxLength: 150
      },
      longDescription: {
        type: "string",
        description: "Long product description",
        maxLength: 1500
      },
      sku: {
        type: "string",
        description: "Stock Keeping Unit (SKU)",
        maxLength: 25
      },
      upc: {
        type: "string",
        description: "Universal Product Code (UPC)",
        maxLength: 15
      },
      shippable: {
        type: "string",
        enum: ["TRUE", "FALSE"],
        description: "Indicates if product requires delivery address"
      },
      active: {
        type: "string",
        enum: ["TRUE", "FALSE"],
        description: "Indicates if product can serve as payment source"
      },
      shop: {
        type: "string",
        description: "Shop code",
        maxLength: 10
      },
      // Product Data Properties
      productType: {
        type: "string",
        enum: Object.values(PRODUCT_TYPES),
        description: "Type of product"
      },
      regularPrice: {
        type: "string",
        description: "Product regular price (positive number with max 2 decimals)"
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Price currency (3-character ISO code)"
      },
      overlapPriority: {
        type: "string",
        enum: Object.values(OVERLAP_PRIORITY),
        description: "Priority when overlapping price schedules exist"
      },
      timeToLive: {
        type: "number",
        description: "Time allowed for product payment in seconds (60-2592000)",
        minimum: 60,
        maximum: 2592000
      },
      activeFrom: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Product active state starting date (YYYY-MM-DD format)"
      },
      activeTo: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Product active state ending date (YYYY-MM-DD format)"
      },
      timeZone: {
        type: "string",
        description: "Product state scheduling timezone (IANA format, e.g., 'Europe/Sofia')"
      },
      // Product Options Properties
      imageUrl: {
        type: "string",
        description: "URL pointing to external product image resource",
        maxLength: 150,
        format: "uri"
      },
      termsUrl: {
        type: "string",
        description: "URL pointing to external terms and conditions resource",
        maxLength: 150,
        format: "uri"
      },
      termsText: {
        type: "string",
        description: "Terms and conditions text",
        maxLength: 3000
      },
      // Authentication
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
      name,
      shortDescription,
      longDescription,
      sku,
      upc,
      shippable,
      active,
      shop,
      productType,
      regularPrice,
      currency,
      overlapPriority,
      timeToLive,
      activeFrom,
      activeTo,
      timeZone,
      imageUrl,
      termsUrl,
      termsText,
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

    // Build prData object only with provided fields
    const prData = {};
    if (productType !== undefined) prData.type = productType;
    if (regularPrice !== undefined) prData.regularPrice = regularPrice;
    if (currency !== undefined) prData.currency = currency;
    if (overlapPriority !== undefined) prData.overlapPriority = overlapPriority;
    if (timeToLive !== undefined) prData.timeToLive = timeToLive;
    if (activeFrom !== undefined) prData.activeFrom = activeFrom;
    if (activeTo !== undefined) prData.activeTo = activeTo;
    if (timeZone !== undefined) prData.timeZone = timeZone;

    // Build prOptions object only with provided fields
    const prOptions = {};
    if (imageUrl !== undefined) prOptions.imageUrl = imageUrl;
    if (termsUrl !== undefined) prOptions.termsUrl = termsUrl;
    if (termsText !== undefined) prOptions.termsText = termsText;

    try {
      const result = await updateProduct({
        productId,
        name,
        shortDescription,
        longDescription,
        sku,
        upc,
        shippable,
        active,
        shop,
        prData,
        prOptions,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const product = result.data;

      return {
        content: [{
          type: "text",
          text: `✅ **Product Updated Successfully**

**Updated Product Details:**
- ID: ${product.productId}
- Name: ${product.name}
- Type: ${product.type}
- Price: ${product.regularPrice} ${product.currencyCode}
- Status: ${product.active ? '✅ Active' : '⏸️ Inactive'}
- Shop: ${product.shopCode} (${product.shopName})
${product.shortDescription ? `- Description: ${product.shortDescription}` : ''}
${product.sku ? `- SKU: ${product.sku}` : ''}
${product.upc ? `- UPC: ${product.upc}` : ''}

**Product Settings:**
- Shippable: ${product.shippable ? 'Yes' : 'No'}
- Time to Live: ${product.timeToLive} seconds
- Sale Price: ${product.salePrice} ${product.currencyCode}
- Overlap Priority: ${product.overlapPriority}

**Active Period:**
- From: ${product.activeFromZoned || product.activeFrom}
- To: ${product.activeToZoned || product.activeTo}
- Timezone: ${product.timeZone}

**API Response:**
\`\`\`json
${JSON.stringify(product, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Next Steps:**
- Use \`payware_products_get_product\` to view updated product details
- Use \`payware_products_create_schedule\` to manage price schedules
- Use \`payware_products_get_product_image\` to generate QR/barcode`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Product Update Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}

**Troubleshooting:**
1. Verify the product ID is correct and exists
2. Check parameter values (dates, price format, currency)
3. Ensure JWT token is valid and not expired
4. Verify partner ID and API access
5. Check that the product belongs to your account`
        }]
      };
    }
  }
};