import { updateProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { PRODUCT_TYPES, OVERLAP_PRIORITY } from '../../shared/products/products-api.js';

/**
 * Update product tool implementation for ISVs
 */
export const updateProductTool = {
  name: "payware_products_update_product",
  description: `Update an existing product on behalf of a merchant (ISV operation). Only provide the fields you want to change.`,

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
        description: "Product identifier to update (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      // Product fields - same as merchant version
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
          text: `✅ **Product Updated Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Updated Product Details:**
- ID: ${product.productId}
- Name: ${product.name}
- Type: ${product.type}
- Price: ${product.regularPrice} ${product.currencyCode}
- Status: ${product.active ? '✅ Active' : '⏸️ Inactive'}
- Shop: ${product.shopCode} (${product.shopName})

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**API Response:**
\`\`\`json
${JSON.stringify(product, null, 2)}
\`\`\``
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

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}`
        }]
      };
    }
  }
};