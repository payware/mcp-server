/**
 * Merchant Logs Tools - Premium Feature
 * Tools for querying and downloading application logs.
 * Requires Premium (PRM) plan subscription.
 */

import {
  queryLogs,
  getLogStatus,
  getLogDownloadUrl,
  downloadLogs,
  LOG_LEVELS
} from '../../shared/logs/logs-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Query logs tool for merchants
 */
export const queryLogsTool = {
  name: "payware_logs_query",
  description: "Query application logs with filters. Premium plan required. Returns paginated JSON log entries for debugging and monitoring your integration.",
  inputSchema: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Start timestamp in ISO 8601 format (e.g., '2024-01-15T00:00:00Z'). Defaults to 24 hours ago."
      },
      to: {
        type: "string",
        description: "End timestamp in ISO 8601 format (e.g., '2024-01-15T23:59:59Z'). Defaults to now."
      },
      level: {
        type: "string",
        enum: ["ERROR", "WARN", "INFO", "DEBUG"],
        description: "Filter by log level. Use ERROR for errors only, WARN for warnings and above, etc."
      },
      logger: {
        type: "string",
        description: "Filter by logger name (partial match). E.g., 'TransactionController' to see transaction-related logs."
      },
      search: {
        type: "string",
        description: "Search text in log messages. Case-insensitive partial match."
      },
      limit: {
        type: "number",
        description: "Maximum records to return (default 1000, max 10000).",
        default: 1000
      },
      cursor: {
        type: "string",
        description: "Pagination cursor from previous response for fetching next page."
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
    required: []
  },

  async handler(args) {
    const {
      from,
      to,
      level,
      logger,
      search,
      limit = 1000,
      cursor,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await queryLogs({
        from,
        to,
        level,
        logger,
        search,
        limit,
        cursor,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;
      const entries = data.entries || [];
      const hasMore = data.hasMore || false;
      const nextCursor = data.nextCursor;

      // Format log entries for display
      let logsPreview = '';
      if (entries.length > 0) {
        const displayEntries = entries.slice(0, 10); // Show first 10
        logsPreview = displayEntries.map(log => {
          const timestamp = log['@timestamp'] || log.timestamp || 'N/A';
          const logLevel = log.level || 'N/A';
          const loggerName = log.logger_name || log.loggerName || 'N/A';
          const message = log.message || 'N/A';
          const shortMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
          return `[${timestamp}] ${logLevel} ${loggerName}\n   ${shortMessage}`;
        }).join('\n\n');

        if (entries.length > 10) {
          logsPreview += `\n\n... and ${entries.length - 10} more entries`;
        }
      } else {
        logsPreview = 'No log entries found matching the criteria.';
      }

      // Build filter summary
      const filters = [];
      if (from) filters.push(`from: ${from}`);
      if (to) filters.push(`to: ${to}`);
      if (level) filters.push(`level: ${level}`);
      if (logger) filters.push(`logger: ${logger}`);
      if (search) filters.push(`search: "${search}"`);
      const filterSummary = filters.length > 0 ? filters.join(', ') : 'none (last 24 hours)';

      return {
        content: [{
          type: "text",
          text: `📋 **Log Query Results**

**Query Summary:**
- Total Entries: ${data.totalCount || entries.length}
- Returned: ${data.returnedCount || entries.length}
- Has More: ${hasMore ? 'Yes' : 'No'}
- Filters: ${filterSummary}

**Log Entries Preview:**
\`\`\`
${logsPreview}
\`\`\`

${hasMore ? `**Pagination:**
Use cursor \`${nextCursor}\` to fetch the next page of results.` : ''}

**Log Levels:**
- 🔴 **ERROR**: Application errors and exceptions
- 🟠 **WARN**: Warnings that may need attention
- 🟢 **INFO**: Informational messages
- 🔵 **DEBUG**: Detailed debugging information

**Tips:**
- Use \`level: "ERROR"\` to quickly find errors
- Use \`search\` to find specific transaction IDs or error messages
- Use \`logger\` filter to focus on specific components

⚠️ **Note:** This is a Premium (PRM) plan feature.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to query logs: ${error.message}`);
    }
  }
};

/**
 * Get log status tool for merchants
 */
export const getLogStatusTool = {
  name: "payware_logs_status",
  description: "Get log availability and storage information. Premium plan required. Shows if logs are available, total size, and file count.",
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
        description: "RSA private key for authentication. Uses environment-specific private key as default."
      }
    },
    required: []
  },

  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await getLogStatus({
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;

      // Format file size
      const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let size = bytes;
        while (size >= 1024 && unitIndex < units.length - 1) {
          size /= 1024;
          unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
      };

      return {
        content: [{
          type: "text",
          text: `📊 **Log Status**

**Availability:**
- Partner ID: ${data.partnerId || partnerId}
- Logs Available: ${data.logsAvailable ? '✅ Yes' : '❌ No'}

**Storage Information:**
- Total Size: ${formatSize(data.totalSizeBytes)}
- File Count: ${data.fileCount || 0} files

**What You Can Do:**
${data.logsAvailable ? `
1. **Query logs** using \`payware_logs_query\` tool
   - Filter by level, logger, search text, date range
   - Paginate through results with cursor

2. **Download logs** using \`payware_logs_download_url\` tool
   - Get compressed archive of logs for offline analysis
` : `
⚠️ No logs are currently available. Logs are generated when API calls are made.
`}

⚠️ **Note:** This is a Premium (PRM) plan feature.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get log status: ${error.message}`);
    }
  }
};

/**
 * Get log download URL tool for merchants
 */
export const getLogDownloadUrlTool = {
  name: "payware_logs_download_url",
  description: "Get download URL for logs archive. Premium plan required. Returns URL for downloading logs as gzipped JSON file.",
  inputSchema: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Start timestamp in ISO 8601 format (e.g., '2024-01-15T00:00:00Z'). Defaults to 24 hours ago."
      },
      to: {
        type: "string",
        description: "End timestamp in ISO 8601 format (e.g., '2024-01-15T23:59:59Z'). Defaults to now."
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
    required: []
  },

  async handler(args) {
    const {
      from,
      to,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and environment-specific private key variables or provide them as parameters.");
    }

    try {
      const result = await getLogDownloadUrl({
        from,
        to,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const data = result.data;

      return {
        content: [{
          type: "text",
          text: `📥 **Log Download Information**

**Download URL:**
\`${data.downloadUrl}\`

**Parameters:**
- From: ${data.parameters.from}
- To: ${data.parameters.to}

**Important:**
${data.note}

**File Format:**
- Content-Type: application/gzip
- Format: Gzipped newline-delimited JSON (NDJSON)
- Each line is a complete JSON log entry

**Usage Example (cURL):**
\`\`\`bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
     -H "Api-Version: 1" \\
     "${data.downloadUrl}" \\
     -o logs.json.gz
\`\`\`

**Processing the Download:**
\`\`\`bash
# Decompress and view
gunzip -c logs.json.gz | head -10

# Parse with jq
gunzip -c logs.json.gz | jq '.level'
\`\`\`

⚠️ **Note:** This is a Premium (PRM) plan feature.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get download URL: ${error.message}`);
    }
  }
};

/**
 * All merchant logs tools
 */
export const merchantLogsTools = [
  queryLogsTool,
  getLogStatusTool,
  getLogDownloadUrlTool
];
