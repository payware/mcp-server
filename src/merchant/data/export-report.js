import { exportReport, EXPORT_FORMATS } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Export report tool for merchants
 */
export const exportReportTool = {
  name: "payware_data_export_report",
  description: "Export a READY report in a specific format (PDF, CSV, Excel, JSON). The report must be in READY status first.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "The request ID from the report generation (UUID format)"
      },
      outputFormat: {
        type: "string",
        description: "Export format",
        enum: Object.values(EXPORT_FORMATS),
        default: EXPORT_FORMATS.PDF
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
      outputFormat = EXPORT_FORMATS.PDF,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    try {
      const result = await exportReport({
        requestId,
        outputFormat,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;

      // The export API returns export details in an outputResource object
      if (!data.outputResource || !data.outputResource.exportId) {
        throw new Error(`Export ID not found in response. Response: ${JSON.stringify(data)}`);
      }

      const exportResource = data.outputResource;

      return {
        content: [{
          type: "text",
          text: `📊 **Report Export Started**

**Export Details:**
- Request ID: ${data.requestId || requestId}
- Export ID: ${exportResource.exportId}
- Format: ${outputFormat.toUpperCase()}
- Status: ${exportResource.status || 'QUEUED'}
- Export Started: ${exportResource.exportedAt || 'Just now'}

**Report Information:**
- Report Type: ${data.reportUnitId || 'N/A'}
- Date Range: ${data.dateFrom || 'Default'} to ${data.dateTo || 'Default'}
- Timezone: ${data.timeZone || 'N/A'}

**Next Steps:**
1. Save the Export ID: \`${exportResource.exportId}\`
2. Use "Get Export Status" tool to monitor export progress
3. When export status is "READY", use "Download Export" tool to get the file

**Available Export Formats:**
- **PDF**: ${EXPORT_FORMATS.PDF} - Formatted reports with charts and styling
- **CSV**: ${EXPORT_FORMATS.CSV} - Comma-separated values for data analysis
- **Excel**: ${EXPORT_FORMATS.EXCEL} - Microsoft Excel format
- **JSON**: ${EXPORT_FORMATS.JSON} - Structured data format

**Export Status Meanings:**
- 🟡 **QUEUED**: Export is waiting to be processed
- ✅ **READY**: Export completed and ready for download
- ❌ **CANCELLED**: Export was cancelled
- 💥 **FAILED**: Error occurred during export

Monitor the export progress using Export ID: \`${exportResource.exportId}\``
        }]
      };
    } catch (error) {
      throw new Error(`Failed to export report: ${error.message}`);
    }
  }
};