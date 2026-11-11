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
import { buildDownloadExportTool } from '../../shared/data/download-export.js';
import { CHANGES, CREATES, READS } from '../../shared/tool-annotations.js';

/**
 * Whose data a report covers, for an ISV (server DataRetrievalService and ReportService, 2026-11-11;
 * kb tech/details/data-api, "Whose data a report covers"). VG: "ISV acting on behalf of a merchant with
 * rights to reports must be able to provide those report; when isv uses reports api for itself is
 * different case; we must support both". Until 2.2.1 these tools required the merchant's token and said
 * an on-behalf report was the ISV's own, which is what the server did then.
 */
const WHOSE_DATA = "Two ways to call, kept apart. With merchantPartnerId and oauth2Token (the merchant's token) you act for that merchant and get its reports: the ones the merchant itself is offered, on the merchant's plan (Standard or Premium), with the merchant's data limited to the shops the merchant assigned to your ISV (none assigned: empty reports). Without them you call for your ISV itself: its own reports, covering everything it handled for all its merchants. A report request belongs to the call that ran it: acting for a merchant you list, poll, export, download and cancel only what you ran for that merchant, and calling for yourself only your own; a request id from the other context answers 404 (ERR_REPORT_REQUEST_NOT_FOUND). The merchant does not see requests you ran for it.";

const MERCHANT_PARTNER_ID = {
  type: "string",
  description: "The merchant's partner ID, to act for that merchant (with oauth2Token). Leave both out to call for your ISV itself."
};
const OAUTH2_TOKEN = {
  type: "string",
  description: "The merchant's OAuth2 token for your ISV, given with merchantPartnerId. Leave both out to call for your ISV itself."
};

/**
 * The data-api auth for an ISV: acting for a merchant when both its partner id and token are given,
 * for the ISV itself when neither is. One without the other is a mistake, not a third mode.
 */
function resolveISVReportAuth(args) {
  const isvPartnerId = args.isvPartnerId || getPartnerIdSafe();
  const privateKey = args.privateKey || getPrivateKeySafe(false); // reports run on production only
  if (!isvPartnerId || !privateKey) {
    throw new Error("ISV Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
  }
  const { merchantPartnerId, oauth2Token } = args;
  if (!merchantPartnerId !== !oauth2Token) {
    throw new Error("Give merchantPartnerId and oauth2Token together to act for a merchant, or neither to call for your ISV itself.");
  }
  return merchantPartnerId
    ? { isvPartnerId, privateKey, merchantPartnerId, oauth2Token }
    : { isvPartnerId, privateKey };
}

/** Who the call was made as, for the result text; never the token itself. */
const contextLines = auth => auth.merchantPartnerId
  ? `- ISV Partner ID: ${auth.isvPartnerId}\n- Acting for merchant: ${auth.merchantPartnerId} (its reports, limited to the shops it assigned to your ISV)`
  : `- ISV Partner ID: ${auth.isvPartnerId}\n- Called for your ISV itself (its own reports)`;

// Create ISV data tool factory
const createISVDataTool = (toolName, apiFunction, description, additionalParams = {}, annotations) => ({
  name: `payware_data_${toolName}`,
  annotations,
  description: `${description} (ISV). Production only. ${WHOSE_DATA}`,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      merchantPartnerId: MERCHANT_PARTNER_ID,
      oauth2Token: OAUTH2_TOKEN,
      isvPartnerId: {
        type: "string",
        description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "ISV RSA private key for authentication. Uses environment-specific private key as default."
      },
      ...additionalParams
    },
    required: Object.keys(additionalParams)
  },

  async handler(args) {
    const auth = resolveISVReportAuth(args);
    const { merchantPartnerId: _m, oauth2Token: _t, isvPartnerId: _i, privateKey: _k, ...rest } = args;

    try {
      const result = await apiFunction({
        ...rest,
        partnerType: 'isv',
        ...auth
      });

      return {
        content: [{
          type: "text",
          text: `📊 **ISV ${description} Completed**

**Result:**
${JSON.stringify(result.data, null, 2)}

**ISV Context:**
${contextLines(auth)}`
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
  annotations: CREATES,
  description: `Run a report asynchronously, as an ISV, for a merchant or for your ISV itself. Production only: sandbox lists no reports and runs none. ${WHOSE_DATA} reportUnitId is a bare id from payware_data_list_reports (the last segment of its path), called the same way: the list differs between the two contexts.`,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reportUnitId: {
        type: "string",
        description: "The report id, bare (processedTransactionsMTD): the last segment of a path from payware_data_list_reports. Which reports you may run is the list that tool returns.",
        enum: Object.values(REPORT_TYPES),
        default: REPORT_TYPES.PROCESSED_TRANSACTIONS
      },
      merchantPartnerId: MERCHANT_PARTNER_ID,
      oauth2Token: OAUTH2_TOKEN,
      dateFrom: {
        type: "string",
        description: "Start date (YYYY-MM-DD). Optional: defaults to today; the WTD, MTD and YTD reports compute their own start.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      dateTo: {
        type: "string",
        description: "End date (YYYY-MM-DD). Optional: defaults to today.",
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
        description: "ISV RSA private key for authentication. Uses environment-specific private key as default."
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
      timeZone = 'GMT'
    } = args;
    const auth = resolveISVReportAuth(args);

    try {
      const result = await generateReport({
        reportUnitId,
        dateFrom,
        dateTo,
        ignorePagination,
        locale,
        timeZone,
        partnerType: 'isv',
        ...auth
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

**ISV Context:**
${contextLines(auth)}

**Next Steps:**
1. Save the Request ID: \`${result.data.requestId}\`
2. Use "Get Report Status" tool to monitor progress
3. When status is "READY", use "Export Report" tool to get the data

**⚠️ Production Only:** reports run on production data only. Poll, export and download this request in the same context it was run in.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate ISV report: ${error.message}`);
    }
  }
};

// Create all other ISV data tools
export const listReportsTool = createISVDataTool('list_reports', listReports, 'List All Available Reports', {}, READS);

export const getReportRequestsTool = createISVDataTool('get_report_requests', getReportRequests, 'Get Report Request History', {
  reportId: {
    type: "string",
    description: "The report id whose runs to list, bare (processedTransactions) or as the path the list returns (/processedTransactions)",
    enum: Object.values(REPORT_TYPES)
  }
}, READS);

export const getExportListTool = createISVDataTool('get_export_list', getExportList, 'Get Export List for Request', {
  requestId: {
    type: "string",
    description: "The request ID (UUID) to get exports for"
  }
}, READS);

export const getReportStatusTool = createISVDataTool('get_report_status', getReportStatus, 'Get Report Status', {
  requestId: {
    type: "string",
    description: "The request ID returned from the report generation request (UUID format)"
  }
}, READS);

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
}, CREATES);

export const getExportStatusTool = createISVDataTool('get_export_status', getExportStatus, 'Get Export Status', {
  exportId: {
    type: "string",
    description: "The export ID returned from the export request (UUID format)"
  }
}, READS);

export const downloadExportTool = buildDownloadExportTool({
  partnerType: 'isv',
  authProperties: {
    merchantPartnerId: MERCHANT_PARTNER_ID,
    oauth2Token: OAUTH2_TOKEN,
    isvPartnerId: { type: "string", description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.", default: getPartnerIdSafe() },
    privateKey: { type: "string", description: "ISV RSA private key for authentication. Uses the production private key as default (reports run on production only)." }
  },
  authRequired: [],
  resolveAuth: resolveISVReportAuth,
  descriptionSuffix: `${WHOSE_DATA}`
});

export const cancelReportTool = createISVDataTool('cancel_report', cancelReport, 'Cancel Report', {
  requestId: {
    type: "string",
    description: "The request ID of the report to cancel (UUID format)"
  }
}, CHANGES);

export const cancelExportTool = createISVDataTool('cancel_export', cancelExport, 'Cancel Export', {
  exportId: {
    type: "string",
    description: "The export ID of the export to cancel (UUID format)"
  }
}, CHANGES);

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