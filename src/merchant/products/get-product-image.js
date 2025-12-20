import { getProductImage } from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { IMAGE_TYPES, IMAGE_FORMATS, QR_ERROR_CORRECTION, BARCODE_LOCATIONS } from '../../shared/products/products-api.js';

/**
 * Get product image tool implementation for merchants
 */
export const getProductImageTool = {
  name: "payware_products_get_product_image",
  description: `Generate a QR code or barcode image for a product.

**QR Code Options:** Format, border, error correction, scale, version
**Barcode Options:** Format, module width, bar height, font size, text location`,

  inputSchema: {
    type: "object",
    properties: {
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
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const imageData = result.data;
      const format = imageData.format;
      const imageType = imageData.type;

      // Truncate image data for display (show first 100 chars + length info)
      const truncatedData = imageData.imageData.length > 100
        ? `${imageData.imageData.substring(0, 100)}... (${imageData.imageData.length} total characters)`
        : imageData.imageData;

      return {
        content: [{
          type: "text",
          text: `🖼️ **Product Image Generated Successfully**

**Image Details:**
- Product ID: ${imageData.id}
- Type: ${imageType}
- Format: ${format}
- Data Length: ${imageData.imageData.length} characters

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
\`\`\`

**API Response:**
\`\`\`json
${JSON.stringify(imageData, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Usage Notes:**
- For ${format === 'SVG' ? 'SVG' : 'raster'} images, decode the base64 data and save as .${format.toLowerCase()} file
- QR codes can be scanned by payment apps to initiate transactions
- Barcodes can be used for inventory and payment processing systems`
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

**Troubleshooting:**
1. Verify the product ID is correct and exists
2. Check image generation parameters (format, dimensions)
3. Ensure the product belongs to your account
4. Verify JWT token is valid and not expired
5. Try different image settings if generation fails`
        }]
      };
    }
  }
};