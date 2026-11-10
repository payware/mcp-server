import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadExport } from './data-api.js';
import { ADDS } from '../tool-annotations.js';

/**
 * payware_data_download_export for every role, from one definition.
 *
 * The ISV and institution versions came from a generic factory that printed the downloaded bytes as
 * JSON - a Buffer serializes to {"type":"Buffer","data":[37,80,...]} - instead of saving the file.
 * This is the merchant tool's behaviour for all three: a text export is previewed, and with
 * saveToFile the file is written to payware-mcp-downloads in the system temp directory, whose path the
 * result names. Reports run on production only, so the key is the production one.
 */

const EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/rtf': 'rtf',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/xml': 'xml',
  'application/xml': 'xml'
};

function extensionOf(result) {
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(result.contentDisposition || '');
  const fromName = named && /\.([A-Za-z0-9]{1,5})$/.exec(named[1]);
  if (fromName) return fromName[1].toLowerCase();
  const type = String(result.contentType || '').split(';')[0].trim().toLowerCase();
  return EXTENSIONS[type] || 'bin';
}

/**
 * @param {Object} role
 * @param {string} role.partnerType   'merchant' | 'isv' | 'payment_institution'
 * @param {Object} role.authProperties schema properties the role adds (an ISV's merchant and token)
 * @param {string[]} role.authRequired those of them that are required
 * @param {Function} role.resolveAuth  args -> the auth parameters for data-api
 */
export function buildDownloadExportTool({ partnerType, authProperties = {}, authRequired = [], resolveAuth }) {
  return {
    name: 'payware_data_download_export',
    annotations: ADDS,
    description: 'Download a READY export file (production only). A text export (CSV, HTML, XML) is previewed; with saveToFile the file is written to payware-mcp-downloads in the system temp directory and the result names its path. A binary export (PDF, XLS(X), DOCX, ODT, ODS, RTF) needs saveToFile.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'The export ID from the export request (UUID format)'
        },
        saveToFile: {
          type: 'boolean',
          description: 'Save the file to payware-mcp-downloads in the system temp directory and return its path. Without it a text export is previewed and a binary one only described.',
          default: false
        },
        ...authProperties
      },
      required: ['exportId', ...authRequired]
    },

    async handler(args) {
      const { exportId, saveToFile = false } = args;
      const auth = resolveAuth(args);
      const result = await downloadExport({ exportId, partnerType, ...auth });

      const bytes = Buffer.from(result.data);
      const contentType = result.contentType || 'unknown';
      const isText = /csv|json|text|xml|html/.test(contentType);

      let saved = '';
      if (saveToFile) {
        const filename = `report_${String(exportId).substring(0, 8)}.${extensionOf(result)}`;
        // The temp directory is writable wherever the server runs; its working directory, set by the
        // MCP client, often is not.
        const directory = join(tmpdir(), 'payware-mcp-downloads');
        mkdirSync(directory, { recursive: true });
        const filepath = join(directory, filename);
        writeFileSync(filepath, bytes);
        saved = `- Saved to: \`${filepath}\`\n`;
      }

      let preview = '';
      if (isText) {
        const text = bytes.toString('utf8');
        const limit = saveToFile ? 500 : 2000;
        preview = `\n**Content preview:**\n\`\`\`\n${text.length > limit ? `${text.substring(0, limit)}\n...[truncated]` : text}\n\`\`\`\n`;
      } else if (!saveToFile) {
        preview = `\nBinary file (${contentType}): call again with saveToFile: true to save it.\n`;
      }

      return {
        content: [{
          type: 'text',
          text: `📊 **Export downloaded**

- Export ID: ${exportId}
- Content type: ${contentType}
- Size: ${bytes.length} bytes
${saved}${preview}`
        }]
      };
    }
  };
}
