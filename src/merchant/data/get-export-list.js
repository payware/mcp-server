import { getExportList } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get export list for request tool for merchants
 */
export const getExportListTool = {
  name: "payware_data_get_export_list",
  description: "Get all export attempts for a specific report request. Returns list of exports in various formats with their status and download information. Production only - not supported in sandbox.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "The request ID (UUID) to get exports for"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses production private key as default (Data API is production-only)."
      }
    },
    required: ["requestId"]
  },

  async handler(args) {
    const {
      requestId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    if (!requestId) {
      throw new Error("requestId is required (UUID from report generation)");
    }

    try {
      const result = await getExportList({
        requestId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const exports = result.data;

      // Group exports by status
      const byStatus = {
        READY: exports.filter(e => e.exportStatus === 'READY'),
        QUEUED: exports.filter(e => e.exportStatus === 'QUEUED'),
        CANCELLED: exports.filter(e => e.exportStatus === 'CANCELLED'),
        FAILED: exports.filter(e => e.exportStatus === 'FAILED')
      };

      // Group by content type
      const byFormat = {};
      exports.forEach(e => {
        const format = e.contentType || 'unknown';
        if (!byFormat[format]) byFormat[format] = [];
        byFormat[format].push(e);
      });

      // Format export list
      const formatExportList = (exportList) => {
        if (exportList.length === 0) return '  *None*';

        return exportList.map(e => {
          // Handle both "application/pdf" and "pdf" formats
          let format = 'UNKNOWN';
          if (e.contentType) {
            if (e.contentType.includes('/')) {
              format = e.contentType.split('/')[1].toUpperCase();
            } else {
              format = e.contentType.toUpperCase();
            }
          }
          const size = e.pages ? `${e.pages} pages` : 'N/A';
          return `  • Export ID: \`${e.exportId}\`\n    - Format: ${format}\n    - Size: ${size}\n    - File: ${e.fileName || 'N/A'}\n    - Updated: ${e.updated}\n    - Complete: ${e.outputFinal ? 'Yes' : 'No'}`;
        }).join('\n\n');
      };

      return {
        content: [{
          type: "text",
          text: `📊 **Export List for Request**

**Request ID:** ${requestId}
**Total Exports:** ${exports.length}

---

## Status Summary
- ✅ **READY:** ${byStatus.READY.length} (available for download)
- 🟡 **QUEUED:** ${byStatus.QUEUED.length} (in progress)
- ❌ **CANCELLED:** ${byStatus.CANCELLED.length}
- 💥 **FAILED:** ${byStatus.FAILED.length}

---

## Format Summary
${Object.keys(byFormat).map(format => `- ${format}: ${byFormat[format].length}`).join('\n')}

---

## Ready Exports (${byStatus.READY.length})
${formatExportList(byStatus.READY)}

${byStatus.READY.length === 0 ? '\n*No exports ready for download yet. Create a new export with `payware_data_export_report`*' : ''}

---

## Queued Exports (${byStatus.QUEUED.length})
${formatExportList(byStatus.QUEUED)}

${byStatus.QUEUED.length === 0 ? '\n*No exports currently being processed*' : ''}

---

**Next Steps:**
- For READY exports, use \`payware_data_download_export\` with the export ID
- For QUEUED exports, use \`payware_data_get_export_status\` to check progress
- To create a new export, use \`payware_data_export_report\` with the request ID

**⚠️ Production Only:**
Data reports are only available in the production environment, not in sandbox.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get export list: ${error.message}`);
    }
  }
};
