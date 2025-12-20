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

// Import individual tools
import { generateReportTool } from './generate-report.js';
import { getReportStatusTool } from './get-report-status.js';
import { exportReportTool } from './export-report.js';
import { listReportsTool } from './list-reports.js';
import { getReportRequestsTool } from './get-report-requests.js';
import { getExportListTool } from './get-export-list.js';

/**
 * Get export status tool for merchants
 */
export const getExportStatusTool = {
  name: "payware_data_get_export_status",
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
        description: "RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["exportId"]
  },

  async handler(args) {
    const {
      exportId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
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
 * Download export tool for merchants
 */
export const downloadExportTool = {
  name: "payware_data_download_export",
  description: "Download a READY export file. The export must be in READY status. Returns binary data for the file.",
  inputSchema: {
    type: "object",
    properties: {
      exportId: {
        type: "string",
        description: "The export ID from the export request (UUID format)"
      },
      saveToFile: {
        type: "boolean",
        description: "Whether to save the downloaded file to disk. If true, saves to /mnt/d/git/payware/mcp/downloads/. If false, only shows metadata/preview.",
        default: false
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
    required: ["exportId"]
  },

  async handler(args) {
    const {
      exportId,
      saveToFile = false,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    try {
      const result = await downloadExport({
        exportId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const sizeInKB = Math.round(result.data.length / 1024);
      const contentType = result.contentType || 'unknown';
      const isTextFormat = contentType.includes('csv') || contentType.includes('json') || contentType.includes('text');

      let savedFileInfo = '';
      let contentPreview = '';

      if (saveToFile) {
        // Determine file extension from content type
        const extensionMap = {
          'application/pdf': 'pdf',
          'application/vnd.ms-excel': 'xls',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
          'text/csv': 'csv',
          'application/json': 'json'
        };
        const extension = extensionMap[contentType] || 'bin';
        const filename = `report_${exportId.substring(0, 8)}.${extension}`;
        const filepath = `/mnt/d/git/payware/mcp/downloads/${filename}`;

        // Save file to downloads directory
        const fs = await import('fs');
        const path = await import('path');
        const downloadDir = path.dirname(filepath);

        // Create downloads directory if it doesn't exist
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }

        fs.writeFileSync(filepath, result.data);
        savedFileInfo = `- Saved to: \`${filepath}\`\n- Filename: ${filename}\n`;
      }

      if (isTextFormat) {
        // For text formats, show a preview
        const textContent = Buffer.from(result.data).toString('utf-8');
        const previewLength = saveToFile ? 500 : 2000; // Shorter preview if saved to file
        const preview = textContent.length > previewLength ?
          textContent.substring(0, previewLength) + '\n\n...[truncated' + (saveToFile ? ', see full file]' : ']') :
          textContent;
        contentPreview = `\n**Content Preview:**\n\`\`\`\n${preview}\n\`\`\`\n`;
      } else if (!saveToFile) {
        contentPreview = `\n**File Type:** Binary format (${contentType})\n**Note:** Binary files cannot be displayed as text. Use \`saveToFile: true\` to save the file to disk.\n`;
      }

      return {
        content: [{
          type: "text",
          text: `📊 **Export Downloaded Successfully**

**File Information:**
- Export ID: ${exportId}
- Content Type: ${result.contentType}
- File Size: ${sizeInKB} KB (${result.contentLength} bytes)
${savedFileInfo}${contentPreview}
**Summary:**
✅ ${saveToFile ? 'File saved to disk and' : 'File'} downloaded successfully

${saveToFile ? '**Tip:** The file has been saved and can be opened with the appropriate application.' : '**Tip:** Use `saveToFile: true` parameter to save the file to disk at `/mnt/d/git/payware/mcp/downloads/`'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to download export: ${error.message}`);
    }
  }
};

/**
 * Cancel report tool for merchants
 */
export const cancelReportTool = {
  name: "payware_data_cancel_report",
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
        description: "RSA private key for authentication. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["exportId"]
  },

  async handler(args) {
    const {
      exportId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
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