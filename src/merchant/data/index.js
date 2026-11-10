/**
 * Merchant Data Tools - Complete Data API Implementation
 * Production-only tools for data retrieval, reporting, and export functionality
 */

import {
  getReportStatus,
  getExportStatus,
  downloadExport,
  cancelReport,
  cancelExport,
  EXPORT_FORMATS
} from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { buildDownloadExportTool } from '../../shared/data/download-export.js';

// Import individual tools
import { generateReportTool } from './generate-report.js';
import { getReportStatusTool } from './get-report-status.js';
import { exportReportTool } from './export-report.js';
import { listReportsTool } from './list-reports.js';
import { getReportRequestsTool } from './get-report-requests.js';
import { getExportListTool } from './get-export-list.js';
import { ADDS, CHANGES, READS } from '../../shared/tool-annotations.js';

/**
 * Get export status tool for merchants
 */
export const getExportStatusTool = {
  name: "payware_data_get_export_status",
  annotations: READS,
  description: "Get the status of a report export request. Use this to monitor export progress.",
  inputSchema: {
    type: "object",
    properties: {
      exportId: {
        type: "string",
        description: "The export ID returned from the export request (UUID format)"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses environment-specific private key as default."
      }
    },
    required: ["exportId"]
  },

  async handler(args) {
    const {
      exportId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false) // reports run on production only
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await getExportStatus({
        exportId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;
      const exportResource = data.outputResource;

      // The export status API returns export information in outputResource
      let downloadInfo = '';
      if (exportResource?.status === 'READY') {
        downloadInfo = `
**🎉 Export is Ready for Download!**
Use the "Download Export" tool with export ID: \`${exportId}\`
Format: ${exportResource.contentType?.toUpperCase()}
Pages: ${exportResource.pages || 'N/A'}`;
      }

      return {
        content: [{
          type: "text",
          text: `📊 **Export Status Check**

**Export Information:**
- Export ID: ${exportId}
- Status: ${exportResource?.status || 'Unknown'}
- Format: ${exportResource?.contentType?.toUpperCase() || 'Unknown'}
- Pages: ${exportResource?.pages || 'N/A'}
- Completed: ${exportResource?.outputFinal ? 'Yes' : 'No'}
- Exported: ${exportResource?.exportedAt || 'N/A'}

**Related Report:**
- Request ID: ${data.requestId}
- Report Type: ${data.reportUnitId}
- Date Range: ${data.dateFrom || 'Default'} to ${data.dateTo || 'Default'}
${downloadInfo}

**Status Meanings:**
- 🟡 **QUEUED**: Export is being processed
- ✅ **READY**: Export completed and ready for download
- ❌ **CANCELLED**: Export was cancelled
- 💥 **FAILED**: Error occurred during export`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get export status: ${error.message}`);
    }
  }
};

/**
 * Download export tool for merchants (shared/data/download-export.js builds it for every role)
 */
export const downloadExportTool = buildDownloadExportTool({
  partnerType: 'merchant',
  authProperties: {
    partnerId: {
      type: "string",
      description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
      default: getPartnerIdSafe()
    },
    privateKey: {
      type: "string",
      description: "RSA private key for authentication. Uses the production private key as default (reports run on production only)."
    }
  },
  resolveAuth: args => {
    const partnerId = args.partnerId || getPartnerIdSafe();
    const privateKey = args.privateKey || getPrivateKeySafe(false);
    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }
    return { partnerId, privateKey };
  }
});

/**
 * Cancel report tool for merchants
 */
export const cancelReportTool = {
  name: "payware_data_cancel_report",
  annotations: CHANGES,
  description: "Cancel a running report generation. Only reports in QUEUED status can be cancelled.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "The request ID of the report to cancel (UUID format)"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses environment-specific private key as default."
      }
    },
    required: ["requestId"]
  },

  async handler(args) {
    const {
      requestId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false) // reports run on production only
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await cancelReport({
        requestId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      return {
        content: [{
          type: "text",
          text: `📊 **Report Cancellation**

**Cancellation Result:**
- Request ID: ${requestId}
- Status: Successfully cancelled
- Response: ${typeof result.data === 'string' ? result.data : 'CANCELLED'}

**What This Means:**
- The report generation has been stopped
- No further processing will occur for this request
- You can generate a new report with the same or different parameters if needed

**Note:**
Only reports in QUEUED status can be cancelled. Reports that are already READY, FAILED, or previously CANCELLED cannot be cancelled.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to cancel report: ${error.message}`);
    }
  }
};

/**
 * Cancel export tool for merchants
 */
export const cancelExportTool = {
  name: "payware_data_cancel_export",
  annotations: CHANGES,
  description: "Cancel a running export process. Only exports in QUEUED status can be cancelled.",
  inputSchema: {
    type: "object",
    properties: {
      exportId: {
        type: "string",
        description: "The export ID of the export to cancel (UUID format)"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses environment-specific private key as default."
      }
    },
    required: ["exportId"]
  },

  async handler(args) {
    const {
      exportId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false) // reports run on production only
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await cancelExport({
        exportId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      return {
        content: [{
          type: "text",
          text: `📊 **Export Cancellation**

**Cancellation Result:**
- Export ID: ${exportId}
- Status: Successfully cancelled
- Response: ${typeof result.data === 'string' ? result.data : 'CANCELLED'}

**What This Means:**
- The export process has been stopped
- No file will be generated for this export request
- You can start a new export with the same report request if the report is still READY

**Note:**
Only exports in QUEUED status can be cancelled. Exports that are already READY, FAILED, or previously CANCELLED cannot be cancelled.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to cancel export: ${error.message}`);
    }
  }
};

/**
 * All merchant data tools
 */
export const merchantDataTools = [
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