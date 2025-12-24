import axios from 'axios';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';

/**
 * Get POI QR code image
 * Note: This endpoint is public and doesn't require authentication
 * @param {Object} params - Parameters for QR code request
 * @returns {Object} QR code response
 */
export async function getPOIQRCode({ poiId, format = 'PNG', useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }

  const headers = {
    'Api-Version': '1'
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/poi/${poiId}/image`, {
      headers,
      params: { format },
      responseType: 'arraybuffer'
    });

    const contentType = response.headers['content-type'];
    const base64Image = Buffer.from(response.data).toString('base64');

    return {
      success: true,
      image: {
        base64: base64Image,
        contentType,
        format,
        size: response.data.length
      },
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        code: error.response?.data?.code,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get POI QR code tool implementation
 */
export const getPOIQRCodeTool = {
  name: "payware_poi_get_qrcode",
  description: `Generate a QR code image for a POI that customers can scan.

**Endpoint:** GET /poi/{poiId}/image
**Authentication:** Public endpoint (no auth required)
**Use Case:** Generate QR codes for printing or displaying on screens.

**Formats:** PNG (default), SVG, JPG

Returns base64-encoded image data that can be saved or displayed.

**Required:** POI ID only.`,

  inputSchema: {
    type: "object",
    required: ["poiId"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
      },
      format: {
        type: "string",
        enum: ["PNG", "SVG", "JPG"],
        description: "Image format (default: PNG)",
        default: "PNG"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    }
  },

  async handler(args) {
    const { poiId, format = 'PNG', useSandbox = true } = args;

    if (!poiId) throw new Error("POI ID is required");

    const result = await getPOIQRCode({ poiId, format, useSandbox });

    if (result.success) {
      const img = result.image;
      const sizeKB = (img.size / 1024).toFixed(2);

      return {
        content: [{
          type: "text",
          text: `📱 **POI QR Code Generated**

**POI ID:** ${poiId}
**Format:** ${img.format}
**Size:** ${sizeKB} KB
**Content-Type:** ${img.contentType}

**Base64 Image Data:**
\`\`\`
${img.base64.substring(0, 100)}...
\`\`\`

**Usage:**
- Save as file: decode base64 and write to ${poiId}.${format.toLowerCase()}
- Display in HTML: \`<img src="data:${img.contentType};base64,${img.base64.substring(0, 20)}...">\`
- Print for physical placement at point of sale

**Full base64 length:** ${img.base64.length} characters

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Generate QR Code**

**POI ID:** ${poiId}

**Error:** ${result.error.message}
**Status:** ${result.error.status || 'N/A'}

**Common Issues:**
- INVALID_POI_ID (400): POI ID format invalid (must be pi + 8 alphanumeric chars)
- POI_NOT_FOUND (404): POI doesn't exist

**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  }
};
