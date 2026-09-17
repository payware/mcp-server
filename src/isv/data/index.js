/**
 * ISV Data Tools - Complete Data API Implementation
 * Production-only tools for data retrieval, reporting, and export functionality for ISVs
 */

import {
  generateReport,
  getReportStatus,
  exportReport,
  getExportStatus,
  downloadExport,
  cancelReport,
  cancelExport,
  listReports,
  getReportRequests,
  getExportList,
  REPORT_TYPES,
  EXPORT_FORMATS,
  LOCALES
} from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

// Create ISV data tool factory
const createISVDataTool = (toolName, apiFunction, description, additionalParams = {}) => ({
  name: `payware_data_${toolName}`,
  description: `${description} (ISV acting on behalf of merchant)`,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      merchantPartnerId: {
        type: "string",
        description: "The merchant's partner ID (required for ISV operations)"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
      },
      isvPartnerId: {
        type: "string",
        description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "ISV RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      },
      ...additionalParams
    },
    required: ["merchantPartnerId", "oauth2Token", ...Object.keys(additionalParams)]
  },

  async handler(args) {
    const {
      merchantPartnerId,
      oauth2Token,
      isvPartnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!isvPartnerId || !privateKey) {
      throw new Error("ISV Partner ID and private key are required.");
    }

    if (!merchantPartnerId || !oauth2Token) {
      throw new Error("Merchant Partner ID and OAuth2 token are required for ISV operations.");
    }

    try {
      const result = await apiFunction({
        ...args,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token
      });

      return {
        content: [{
          type: "text",
          text: `📊 **ISV ${description} Completed**

**Result:**
${JSON.stringify(result.data, null, 2)}

**ISV Context:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 20)}...

**Note:** This operation was performed on behalf of the merchant using ISV authentication.`
        }]
      };
    } catch (error) {
      throw new Error(`ISV failed to ${toolName.replace('_', ' ')}: ${error.message}`);
    }
  }
});

/**
 * Generate report tool for ISVs
 */
export const generateReportTool = {
  name: "payware_data_generate_report",
  description: "Generate an asynchronous data report for ISV data analysis and reporting on behalf of merchants. Production only - not supported in sandbox.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reportUnitId: {
        type: "string",
        description: "The ID of the report to generate",
        enum: Object.values(REPORT_TYPES),
        default: REPORT_TYPES.PROCESSED_TRANSACTIONS
      },
      merchantPartnerId: {
        type: "string",
        description: "The merchant's partner ID (required for ISV operations)"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
      },
      dateFrom: {
        type: "string",
        description: "Start date for the reporting period (YYYY-MM-DD format). Required for premium reports.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      dateTo: {
        type: "string",
        description: "End date for the reporting period (YYYY-MM-DD format). Required for premium reports.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      ignorePagination: {
        type: "boolean",
        description: "If true, return report as single continuous document. If false, paginate results.",
        default: false
      },
      locale: {
        type: "string",
        description: "Locale for the report",
        enum: Object.values(LOCALES),
        default: LOCALES.ENGLISH_US
      },
      timeZone: {
        type: "string",
        description: "Timezone for date calculations (e.g., 'Europe/Sofia', 'America/New_York')",
        default: "GMT"
      },
      isvPartnerId: {
        type: "string",
        description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "ISV RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["reportUnitId", "merchantPartnerId", "oauth2Token"]
  },

  async handler(args) {
    const {
      reportUnitId,
      merchantPartnerId,
      oauth2Token,
      dateFrom,
      dateTo,
      ignorePagination = false,
      locale = LOCALES.ENGLISH_US,
      timeZone = 'GMT',
      isvPartnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!isvPartnerId || !privateKey) {
      throw new Error("ISV Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    if (!merchantPartnerId || !oauth2Token) {
      throw new Error("Merchant Partner ID and OAuth2 token are required for ISV operations.");
    }

    try {
      const result = await generateReport({
        reportUnitId,
        dateFrom,
        dateTo,
        ignorePagination,
        locale,
        timeZone,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token
      });

      return {
        content: [{
          type: "text",
          text: `📊 **ISV Data Report Generation Started**

**Report Details:**
- Request ID: ${result.data.requestId}
- Status: ${result.data.status}
- Report Type: ${reportUnitId}
- Generated: ${result.data.generatedAt}

**ISV Authentication:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 20)}...

**Next Steps:**
1. Save the Request ID: \`${result.data.requestId}\`
2. Use "Get Report Status" tool to monitor progress
3. When status is "READY", use "Export Report" tool to get the data

**⚠️ Production Only & ISV Authorization Required:**
This feature requires proper OAuth2 authorization from the merchant and is only available in production.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate ISV report: ${error.message}`);
    }
  }
};

// Create all other ISV data tools
export const listReportsTool = createISVDataTool('list_reports', listReports, 'List All Available Reports', {});

export const getReportRequestsTool = createISVDataTool('get_report_requests', getReportRequests, 'Get Report Request History', {
  reportId: {
    type: "string",
    description: "The report unit ID (path) to get execution history for (e.g., '/processedTransactions')",
    enum: Object.values(REPORT_TYPES)
  }
});

export const getExportListTool = createISVDataTool('get_export_list', getExportList, 'Get Export List for Request', {
  requestId: {
    type: "string",
    description: "The request ID (UUID) to get exports for"
  }
});

export const getReportStatusTool = createISVDataTool('get_report_status', getReportStatus, 'Get Report Status', {
  requestId: {
    type: "string",
    description: "The request ID returned from the report generation request (UUID format)"
  }
});

export const exportReportTool = createISVDataTool('export_report', exportReport, 'Export Report', {
  requestId: {
    type: "string",
    description: "The request ID from the report generation (UUID format)"
  },
  outputFormat: {
    type: "string",
    description: "Export format",
    enum: Object.values(EXPORT_FORMATS),
    default: EXPORT_FORMATS.PDF
  }
});

export const getExportStatusTool = createISVDataTool('get_export_status', getExportStatus, 'Get Export Status', {
  exportId: {
    type: "string",
    description: "The export ID returned from the export request (UUID format)"
  }
});

export const downloadExportTool = createISVDataTool('download_export', downloadExport, 'Download Export', {
  exportId: {
    type: "string",
    description: "The export ID from the export request (UUID format)"
  }
});

export const cancelReportTool = createISVDataTool('cancel_report', cancelReport, 'Cancel Report', {
  requestId: {
    type: "string",
    description: "The request ID of the report to cancel (UUID format)"
  }
});

export const cancelExportTool = createISVDataTool('cancel_export', cancelExport, 'Cancel Export', {
  exportId: {
    type: "string",
    description: "The export ID of the export to cancel (UUID format)"
  }
});

/**
 * All ISV data tools
 */
export const isvDataTools = [
  listReportsTool,
  generateReportTool,
  getReportRequestsTool,
  getReportStatusTool,
  exportReportTool,
  getExportListTool,
  getExportStatusTool,
  downloadExportTool,
  cancelReportTool,
  cancelExportTool
];