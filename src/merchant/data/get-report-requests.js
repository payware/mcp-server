import { getReportRequests, REPORT_TYPES } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get report request history tool for merchants
 */
export const getReportRequestsTool = {
  name: "payware_data_get_report_requests",
  description: "Get all execution requests for a specific report type. Returns historical execution records with status and parameters. Production only - not supported in sandbox.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: {
        type: "string",
        description: "The report unit ID (path) to get execution history for (e.g., '/processedTransactions')",
        enum: Object.values(REPORT_TYPES)
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
    required: ["reportId"]
  },

  async handler(args) {
    const {
      reportId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    if (!reportId) {
      throw new Error("reportId is required. Use one of the available report paths (e.g., '/processedTransactions')");
    }

    try {
      const result = await getReportRequests({
        reportId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const requests = result.data;
      const reportTypeName = Object.keys(REPORT_TYPES).find(key => REPORT_TYPES[key] === reportId) || reportId;

      // Group requests by status
      const byStatus = {
        READY: requests.filter(r => r.requestStatus === 'READY'),
        QUEUED: requests.filter(r => r.requestStatus === 'QUEUED'),
        CANCELLED: requests.filter(r => r.requestStatus === 'CANCELLED'),
        FAILED: requests.filter(r => r.requestStatus === 'FAILED')
      };

      // Format request list
      const formatRequestList = (requestList) => {
        if (requestList.length === 0) return '  *None*';

        return requestList.slice(0, 5).map(r => {
          const dateRange = r.dateFrom && r.dateTo
            ? `${r.dateFrom} to ${r.dateTo}`
            : 'Default range';
          return `  • Request ID: \`${r.requestId}\`\n    - Updated: ${r.updated}\n    - Date Range: ${dateRange}\n    - Pagination: ${r.ignorePagination ? 'Disabled' : 'Enabled'}`;
        }).join('\n\n');
      };

      const recentRequests = requests.slice(0, 10);

      return {
        content: [{
          type: "text",
          text: `📊 **Report Request History**

**Report Type:** ${reportTypeName}
**Report ID:** ${reportId}
**Total Requests:** ${requests.length}

---

## Status Summary
- ✅ **READY:** ${byStatus.READY.length} (available for export)
- 🟡 **QUEUED:** ${byStatus.QUEUED.length} (in progress)
- ❌ **CANCELLED:** ${byStatus.CANCELLED.length}
- 💥 **FAILED:** ${byStatus.FAILED.length}

---

## Ready Reports (${byStatus.READY.length})
${formatRequestList(byStatus.READY)}

${byStatus.READY.length > 5 ? `\n*Showing 5 of ${byStatus.READY.length} ready reports*` : ''}

---

## Queued Reports (${byStatus.QUEUED.length})
${formatRequestList(byStatus.QUEUED)}

${byStatus.QUEUED.length > 5 ? `\n*Showing 5 of ${byStatus.QUEUED.length} queued reports*` : ''}

---

**Next Steps:**
- For READY reports, use \`payware_data_export_report\` with the request ID
- For QUEUED reports, use \`payware_data_get_report_status\` to check progress
- To see exports for a specific request, use \`payware_data_get_export_list\`

**⚠️ Production Only:**
Data reports are only available in the production environment, not in sandbox.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get report requests: ${error.message}`);
    }
  }
};
