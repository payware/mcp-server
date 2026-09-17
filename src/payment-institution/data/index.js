/**
 * Payment Institution Data Tools - Complete Data API Implementation
 * Production-only tools for data retrieval, reporting, and export functionality for Payment Institutions
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

// Create a payment institution tool factory
const createPIDataTool = (toolName, apiFunction, description, additionalParams = {}) => ({
  name: `payware_data_${toolName}`,
  description: `${description} (Payment Institution data access)`,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      partnerId: {
        type: "string",
        description: "Payment Institution Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "Payment Institution RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      },
      ...additionalParams
    },
    required: Object.keys(additionalParams)
  },

  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Payment Institution Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await apiFunction({
        ...args,
        partnerType: 'payment_institution',
        partnerId,
        privateKey
      });

      return {
        content: [{
          type: "text",
          text: `🏦 **Payment Institution ${description}**\n\n${JSON.stringify(result.data, null, 2)}\n\n**Payment Institution Context:**\n- Partner ID: ${partnerId}\n- Role: Payment Institution (P2P transactions)`
        }]
      };
    } catch (error) {
      throw new Error(`Payment Institution failed to ${toolName.replace('_', ' ')}: ${error.message}`);
    }
  }
});

/**
 * Generate report tool for Payment Institutions
 */
export const generateReportTool = {
  name: "payware_data_generate_report",
  description: "Generate an asynchronous data report for Payment Institution analysis. Focuses on P2P transaction flows and cross-institution payments. Production only.",
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
      partnerId: {
        type: "string",
        description: "Payment Institution Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "Payment Institution RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["reportUnitId"]
  },

  async handler(args) {
    const {
      reportUnitId,
      dateFrom,
      dateTo,
      ignorePagination = false,
      locale = LOCALES.ENGLISH_US,
      timeZone = 'GMT',
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Payment Institution Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    // Check for required date range on premium reports
    const premiumReports = [
      REPORT_TYPES.PROCESSED_TRANSACTIONS,
      REPORT_TYPES.SCHEDULES_LIST,
      REPORT_TYPES.TRANSACTIONS_PER_PRODUCT,
      REPORT_TYPES.SALES_PER_PRODUCT,
      REPORT_TYPES.TRANSACTIONS_PER_WEBPOS
    ];

    if (premiumReports.includes(reportUnitId) && (!dateFrom || !dateTo)) {
      throw new Error(`Report "${reportUnitId}" requires dateFrom and dateTo parameters (YYYY-MM-DD format)`);
    }

    try {
      const result = await generateReport({
        reportUnitId,
        dateFrom,
        dateTo,
        ignorePagination,
        locale,
        timeZone,
        partnerType: 'payment_institution',
        partnerId,
        privateKey
      });

      const reportType = Object.keys(REPORT_TYPES).find(key => REPORT_TYPES[key] === reportUnitId) || reportUnitId;

      return {
        content: [{
          type: "text",
          text: `🏦 **Payment Institution Data Report Generation Started**

**Report Details:**
- Type: ${reportType}
- Report Unit ID: ${reportUnitId}
- Request ID: ${result.data.requestId}
- Status: ${result.data.status}
- Generated: ${result.data.generatedAt}

**Payment Institution Context:**
- Partner ID: ${partnerId}
- Role: Payment Institution (handles P2P transactions)
- Access: Cross-institution payment flows

**Report Parameters:**
- Date Range: ${dateFrom || 'Default'} to ${dateTo || 'Default'}
- Timezone: ${timeZone}
- Locale: ${locale}
- Pagination: ${ignorePagination ? 'Disabled (single document)' : 'Enabled'}

**Next Steps:**
1. Save the Request ID: \`${result.data.requestId}\`
2. Use "Get Report Status" tool to monitor progress
3. When status is "READY", use "Export Report" tool to get the data

**Payment Institution Reports Include:**
- P2P transaction flows (SRC/DST roles)
- Cross-institution payment data
- Settlement and reconciliation data
- Transaction fees and commissions
- Partner network activity

**⚠️ Production Only:**
This feature is only available in the production environment, not in sandbox.

**Note:** Payment Institution reports may include additional data specific to P2P transactions and cross-institution flows that are not available to regular merchants.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate Payment Institution report: ${error.message}`);
    }
  }
};

// Create all other PI data tools
export const listReportsTool = createPIDataTool('list_reports', listReports, 'List All Available Reports', {});

export const getReportRequestsTool = createPIDataTool('get_report_requests', getReportRequests, 'Get Report Request History', {
  reportId: {
    type: "string",
    description: "The report unit ID (path) to get execution history for (e.g., '/processedTransactions')",
    enum: Object.values(REPORT_TYPES)
  }
});

export const getExportListTool = createPIDataTool('get_export_list', getExportList, 'Get Export List for Request', {
  requestId: {
    type: "string",
    description: "The request ID (UUID) to get exports for"
  }
});

export const getReportStatusTool = createPIDataTool('get_report_status', getReportStatus, 'Get Report Status', {
  requestId: {
    type: "string",
    description: "The request ID returned from the report generation request (UUID format)"
  }
});

export const exportReportTool = createPIDataTool('export_report', exportReport, 'Export Report', {
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

export const getExportStatusTool = createPIDataTool('get_export_status', getExportStatus, 'Get Export Status', {
  exportId: {
    type: "string",
    description: "The export ID returned from the export request (UUID format)"
  }
});

export const downloadExportTool = createPIDataTool('download_export', downloadExport, 'Download Export', {
  exportId: {
    type: "string",
    description: "The export ID from the export request (UUID format)"
  }
});

export const cancelReportTool = createPIDataTool('cancel_report', cancelReport, 'Cancel Report', {
  requestId: {
    type: "string",
    description: "The request ID of the report to cancel (UUID format)"
  }
});

export const cancelExportTool = createPIDataTool('cancel_export', cancelExport, 'Cancel Export', {
  exportId: {
    type: "string",
    description: "The export ID of the export to cancel (UUID format)"
  }
});

/**
 * All Payment Institution data tools
 */
export const paymentInstitutionDataTools = [
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