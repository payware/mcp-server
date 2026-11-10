import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';

/**
 * Get POI QR code image via ISV authentication
 *
 * Not a public endpoint: the server resolves the merchant from the token and only answers for that
 * merchant's own POIs (ApiPOIController.getQRCode, V-05), so an unauthenticated request was refused.
 * @param {Object} params - Parameters for QR code request
 * @returns {Object} QR code response
 */
export async function getPOIQRCode({ poiId, format = 'PNG', merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!poiId) {
    throw new Error('POI ID is required');
  }



  // Create ISV JWT token (GET request - no body)
  const jwtData = await createJWTForPartner({
    partnerId: getPartnerIdSafe(),
    privateKey: getPrivateKeySafe(useSandbox),
    requestBody: null,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  const headers = {
    'Authorization': `Bearer ${jwtData.token}`,
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
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Get POI QR code tool implementation
 */
export const getPOIQRCodeTool = {
  name: "payware_poi_get_qrcode",
  annotations: READS,
  description: `Generate a QR code image for a POI that customers can scan.

**Endpoint:** GET /poi/{poiId}/image
**Authentication:** On behalf of the merchant that owns the POI
**Use Case:** Generate QR codes for printing or displaying on screens.

**Formats:** PNG (default), SVG, JPG

Returns the image itself (MCP image content); an SVG comes back as its markup.

**Required:** POI ID, and the merchant partner ID and OAuth2 token to act on its behalf.`,

  inputSchema: {
    type: "object",
    required: ["poiId", "merchantPartnerId", "oauth2Token"],
    properties: {
      poiId: {
        type: "string",
        description: "The POI identifier (format: pi + 8 alphanumeric chars, e.g., piABC12345)"
      },
      merchantPartnerId: {
        type: "string",
        description: "Partner ID of the target merchant (8 alphanumeric characters)"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
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
    const { poiId, format = 'PNG', merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!poiId) throw new Error("POI ID is required");

    const result = await getPOIQRCode({ poiId, format, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const img = result.image;
      // The whole image. This returned the first 100 base64 characters, which is not an image.
      const summary = `📱 **POI QR code** for ${poiId}: ${img.format}, ${img.size} bytes, ${img.contentType}. Print it or show it at the point of sale; payers scan it to pay the price set on the POI.`;
      if (/svg/i.test(img.contentType || img.format)) {
        return {
          content: [{
            type: "text",
            text: `${summary}\n\n\`\`\`xml\n${Buffer.from(img.base64, 'base64').toString('utf8')}\n\`\`\``
          }]
        };
      }
      return {
        content: [
          { type: "image", data: img.base64, mimeType: img.contentType || (format === 'JPG' ? 'image/jpeg' : 'image/png') },
          { type: "text", text: summary }
        ]
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
