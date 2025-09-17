import { createProduct } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { PRODUCT_TYPES, OVERLAP_PRIORITY } from '../../shared/products/products-api.js';

/**
 * Create product tool implementation for ISVs
 */
export const createProductTool = {
  name: "payware_products_create_product",
  description: `Create a new product for inventory management and payment processing on behalf of a merchant (ISV operation).

**ISV Authentication**: Requires ISV credentials and OAuth2 token from target merchant.

**Product Structure:**
📦 **PRODUCT METADATA**: name, shortDescription, longDescription, sku, upc, shippable, active, shop
💰 **PRODUCT DATA** (prData object): type, regularPrice, currency, overlapPriority, timeToLive, activeFrom, activeTo, timeZone
⚙️ **PRODUCT OPTIONS** (prOptions object): imageUrl, termsUrl, termsText

**Required:** merchantPartnerId, oauth2Token, name`,

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
      // Product fields
      name: {
        type: "string",
        description: "Product recognizable name (required)",
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
        description: "Indicates if product requires delivery address",
        default: "FALSE"
      },
      active: {
        type: "string",
        enum: ["TRUE", "FALSE"],
        description: "Indicates if product can serve as payment source",
        default: "FALSE"
      },
      shop: {
        type: "string",
        description: "Shop code (if not supplied, default shop is used)",
        maxLength: 10
      },
      // Product Data Properties
      productType: {
        type: "string",
        enum: Object.values(PRODUCT_TYPES),
        description: "Type of product",
        default: PRODUCT_TYPES.ITEM
      },
      regularPrice: {
        type: "string",
        description: "Product regular price (positive number with max 2 decimals)",
        default: "0.00"
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Price currency (3-character ISO code)",
        default: "EUR"
      },
      overlapPriority: {
        type: "string",
        enum: Object.values(OVERLAP_PRIORITY),
        description: "Priority when overlapping price schedules exist",
        default: OVERLAP_PRIORITY.LOWEST
      },
      timeToLive: {
        type: "number",
        description: "Time allowed for product payment in seconds (60-2592000)",
        minimum: 60,
        maximum: 2592000,
        default: 86400
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
        description: "Product state scheduling timezone (IANA format, e.g., 'Europe/Sofia')",
        default: "GMT"
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
      // ISV Environment
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "name"]
  },

  async handler(args) {
    const {
      merchantPartnerId,
      oauth2Token,
      name,
      shortDescription,
      longDescription,
      sku,
      upc,
      shippable = "FALSE",
      active = "FALSE",
      shop,
      productType = PRODUCT_TYPES.ITEM,
      regularPrice = "0.00",
      currency = "EUR",
      overlapPriority = OVERLAP_PRIORITY.LOWEST,
      timeToLive = 86400,
      activeFrom,
      activeTo,
      timeZone = "GMT",
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

    if (!name) {
      throw new Error("Product name is required");
    }

    // Get ISV credentials
    const isvPartnerId = getPartnerIdSafe();
    const privateKey = getPrivateKeySafe(useSandbox);

    if (!isvPartnerId) {
      throw new Error("ISV Partner ID is required. Set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Set environment-specific private key variable.");
    }

    // Build prData object
    const prData = {
      type: productType,
      regularPrice,
      currency,
      overlapPriority,
      timeToLive,
      timeZone
    };

    if (activeFrom) prData.activeFrom = activeFrom;
    if (activeTo) prData.activeTo = activeTo;

    // Build prOptions object
    const prOptions = {};
    if (imageUrl) prOptions.imageUrl = imageUrl;
    if (termsUrl) prOptions.termsUrl = termsUrl;
    if (termsText) prOptions.termsText = termsText;

    try {
      const result = await createProduct({
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
          text: `📦 **Product Created Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Product Details:**
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

**Next Steps:**
1. Save the product ID: \`${product.productId}\`
2. Use \`payware_products_get_product\` to view product details
3. Use \`payware_products_create_schedule\` to add price schedules
4. Use \`payware_products_register_audio\` to add soundbites`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Product Creation Failed**

**Error Details:**
- Message: ${error.message}

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}

**Troubleshooting:**
1. Verify OAuth2 token is valid and not expired
2. Ensure merchant partner ID is correct (8 characters)
3. Check product parameters (name, price format, dates)
4. Confirm ISV has authorization to act on behalf of merchant
5. Verify private key matches public key registered with payware`
        }]
      };
    }
  }
};