import { getReportStatus } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get report status tool for merchants
 */
export const getReportStatusTool = {
  name: "payware_data_get_report_status",
  description: "Get the status of an asynchronous report generation request. Use this to monitor report progress.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "The request ID returned from the report generation request (UUID format)"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["requestId"]
  },

  async handler(args) {
    const {
      requestId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await getReportStatus({
        requestId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;
      const statusEmoji = {
        'QUEUED': '⏳',
        'READY': '✅',
        'CANCELLED': '❌',
        'FAILED': '💥'
      };

      let nextSteps = '';
      if (data.status === 'READY') {
        nextSteps = `
**🎉 Report is Ready!**
Use the "Export Report" tool with request ID: \`${requestId}\`
Available formats: PDF, CSV, Excel, JSON`;
      } else if (data.status === 'QUEUED') {
        nextSteps = `
**⏳ Report is Processing**
Check status again in a few moments using the same request ID.`;
      } else if (data.status === 'FAILED') {
        nextSteps = `
**💥 Report Failed**
You may need to generate a new report with different parameters.`;
      } else if (data.status === 'CANCELLED') {
        nextSteps = `
**❌ Report was Cancelled**
Generate a new report if needed.`;
      }

      let outputResourcesInfo = '';
      if (data.outputResources && data.outputResources.length > 0) {
        outputResourcesInfo = `
**Export Resources:**
${data.outputResources.map(resource =>
  `- Export ID: ${resource.exportId}
  - Format: ${resource.contentType}
  - Status: ${statusEmoji[resource.status] || '❓'} ${resource.status}
  - Pages: ${resource.pages || 'N/A'}
  - Completed: ${resource.outputFinal ? 'Yes' : 'No'}`
).join('\n')}`;
      }

      return {
        content: [{
          type: "text",
          text: `📊 **Report Status Check**

**Report Information:**
- Request ID: ${data.requestId}
- Report Type: ${data.reportUnitId}
- Status: ${statusEmoji[data.status] || '❓'} ${data.status}
- Generated: ${data.generatedAt}

**Report Parameters:**
- Date Range: ${data.dateFrom || 'Default'} to ${data.dateTo || 'Default'}
- Timezone: ${data.timeZone}
- Pagination: ${data.ignorePagination ? 'Disabled' : 'Enabled'}
${outputResourcesInfo}
${nextSteps}

**Status Meanings:**
- 🟡 **QUEUED**: Report is waiting to be processed
- ✅ **READY**: Report completed and available for export
- ❌ **CANCELLED**: Report was cancelled by user
- 💥 **FAILED**: Error occurred during report generation`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get report status: ${error.message}`);
    }
  }
};