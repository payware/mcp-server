import { getProductImage } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { IMAGE_TYPES, IMAGE_FORMATS, QR_ERROR_CORRECTION, BARCODE_LOCATIONS } from '../../shared/products/products-api.js';

/**
 * Get product image tool implementation for ISVs
 */
export const getProductImageTool = {
  name: "payware_products_get_product_image",
  description: `Generate a QR code or barcode image for a merchant's product (ISV operation).`,

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
      type: {
        type: "string",
        enum: Object.values(IMAGE_TYPES),
        description: "Type of image to generate",
        default: IMAGE_TYPES.QR
      },
      // QR Code Options
      qrFormat: {
        type: "string",
        enum: Object.values(IMAGE_FORMATS),
        description: "QR code image format (applies when type=QR)",
        default: IMAGE_FORMATS.SVG
      },
      qrBorder: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "QR code border size in modules (applies when type=QR)",
        default: 4
      },
      qrErrorCorrection: {
        type: "string",
        enum: Object.values(QR_ERROR_CORRECTION),
        description: "QR code error correction level (applies when type=QR)",
        default: QR_ERROR_CORRECTION.QUARTILE
      },
      qrScale: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "QR code module size in pixels, irrelevant for SVG (applies when type=QR)",
        default: 16
      },
      qrVersion: {
        type: "number",
        minimum: 1,
        maximum: 40,
        description: "QR code version, higher versions store more data (applies when type=QR)",
        default: 10
      },
      // Barcode Options
      barFormat: {
        type: "string",
        enum: Object.values(IMAGE_FORMATS),
        description: "Barcode image format (applies when type=BARCODE)",
        default: IMAGE_FORMATS.SVG
      },
      barModuleWidth: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Barcode module width in pixels (applies when type=BARCODE)",
        default: 2
      },
      barBarHeight: {
        type: "number",
        minimum: 15,
        maximum: 1000,
        description: "Barcode height in pixels (applies when type=BARCODE)",
        default: 100
      },
      barFontSize: {
        type: "number",
        minimum: 0,
        maximum: 24,
        description: "Barcode font size in pixels (applies when type=BARCODE)",
        default: 12
      },
      barHumanReadableLocation: {
        type: "string",
        enum: Object.values(BARCODE_LOCATIONS),
        description: "Barcode text position (applies when type=BARCODE)",
        default: BARCODE_LOCATIONS.NONE
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
      type = IMAGE_TYPES.QR,
      qrFormat = IMAGE_FORMATS.SVG,
      qrBorder = 4,
      qrErrorCorrection = QR_ERROR_CORRECTION.QUARTILE,
      qrScale = 16,
      qrVersion = 10,
      barFormat = IMAGE_FORMATS.SVG,
      barModuleWidth = 2,
      barBarHeight = 100,
      barFontSize = 12,
      barHumanReadableLocation = BARCODE_LOCATIONS.NONE,
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

    // Build options based on type
    const qrOptions = type === IMAGE_TYPES.QR ? {
      qrFormat,
      qrBorder,
      qrErrorCorrection,
      qrScale,
      qrVersion
    } : {};

    const barOptions = type === IMAGE_TYPES.BARCODE ? {
      barFormat,
      barModuleWidth,
      barBarHeight,
      barFontSize,
      barHumanReadableLocation
    } : {};

    try {
      const result = await getProductImage({
        productId,
        type,
        qrOptions,
        barOptions,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const imageData = result.data;
      const format = imageData.format;
      const imageType = imageData.type;

      // Truncate image data for display
      const truncatedData = imageData.imageData.length > 100
        ? `${imageData.imageData.substring(0, 100)}... (${imageData.imageData.length} total characters)`
        : imageData.imageData;

      return {
        content: [{
          type: "text",
          text: `🖼️ **Product Image Generated Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Image Details:**
- Product ID: ${imageData.id}
- Type: ${imageType}
- Format: ${format}
- Data Length: ${imageData.imageData.length} characters

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**Configuration Used:**
${type === IMAGE_TYPES.QR ? `**QR Code Settings:**
- Format: ${qrFormat}
- Border: ${qrBorder} modules
- Error Correction: ${qrErrorCorrection}
- Scale: ${qrScale}px per module
- Version: ${qrVersion}` : ''}
${type === IMAGE_TYPES.BARCODE ? `**Barcode Settings:**
- Format: ${barFormat}
- Module Width: ${barModuleWidth}px
- Height: ${barBarHeight}px
- Font Size: ${barFontSize}px
- Text Location: ${barHumanReadableLocation}` : ''}

**Image Data (Base64):**
\`\`\`
${truncatedData}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Image Generation Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Image Type: ${type}

**ISV Authentication Check:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId || 'Missing'}
- OAuth2 Token: ${oauth2Token ? 'Provided' : 'Missing'}`
        }]
      };
    }
  }
};