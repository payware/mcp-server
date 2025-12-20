import { listReports } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * List all available reports tool for merchants
 */
export const listReportsTool = {
  name: "payware_data_list_reports",
  description: "List all available report types with their configurations, descriptions, and visibility settings. Production only - not supported in sandbox.",
  inputSchema: {
    type: "object",
    properties: {
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
    required: []
  },

  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    try {
      const result = await listReports({
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const reports = result.data;
      const basicReports = reports.filter(r => r.plan === 'BSC');
      const standardReports = reports.filter(r => r.plan === 'STD');
      const premiumReports = reports.filter(r => r.plan === 'PRM');
      const merchantReports = reports.filter(r => r.merchantVisible);

      // Format report list
      const formatReportList = (reportList) => {
        if (!reportList || reportList.length === 0) {
          return '  (No reports available)';
        }
        return reportList.map(r =>
          `  • **${r.name || 'Unnamed Report'}**\n    - Path: \`${r.path || 'N/A'}\`\n    - Format: ${r.defaultFormat?.toUpperCase() || 'N/A'}\n    - Parameters: ${r.parameters ? 'Required' : 'Not required'}\n    - Description: ${r.description || 'N/A'}`
        ).join('\n\n');
      };

      return {
        content: [{
          type: "text",
          text: `📊 **Available Data Reports**

**Total Reports:** ${reports.length}
**Merchant Accessible:** ${merchantReports.length}
**Basic Plan:** ${basicReports.length}
**Standard Plan:** ${standardReports.length}
**Premium Plan:** ${premiumReports.length}

---

## Basic Reports (${basicReports.length})
These reports are available on all plans (Basic, Standard, and Premium) and generally don't require date range parameters.

${formatReportList(basicReports)}

---

## Standard Reports (${standardReports.length})
These reports are available on Standard and Premium plans and may require date range parameters.

${formatReportList(standardReports)}

---

## Premium Reports (${premiumReports.length})
These reports require a Premium subscription and typically need date range parameters.

${formatReportList(premiumReports)}

---

**How to Use Reports:**
1. Choose a report from the list above
2. Use the \`payware_data_generate_report\` tool with the report path
3. Monitor progress with \`payware_data_get_report_status\`
4. Export the report with \`payware_data_export_report\`

**⚠️ Production Only:**
Data reports are only available in the production environment, not in sandbox.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to list reports: ${error.message}`);
    }
  }
};
