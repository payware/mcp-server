/**
 * Merchant partner tools registry
 * Tools available for merchants accepting payments directly
 */

// Transaction tools
import { createTransactionTool } from './transactions/create-transaction.js';
import { getTransactionStatusTool } from './transactions/get-status.js';
import { cancelTransactionTool } from './transactions/cancel-transaction.js';
import { getTransactionHistoryTool } from './transactions/transaction-history.js';
import { processTransactionTool } from './transactions/process-transaction.js';
import { simulateCallbackTool } from './transactions/simulate-callback.js';

// Data tools
import { merchantDataTools } from './data/index.js';

// Product tools
import { merchantProductTools } from './products/index.js';

// Deep links tools
import { merchantDeepLinksTools } from './deep-links/index.js';

// Shared utility tools
import { getServerInfoTool } from '../utils/server-info.js';

// Import shared tools
import { sharedTools } from '../shared/index.js';

/**
 * All merchant-specific tools
 */
export const merchantTools = [
  // Shared tools (authentication, utilities, etc.)
  ...sharedTools,

  // Transaction management
  createTransactionTool,
  getTransactionStatusTool,
  cancelTransactionTool,
  getTransactionHistoryTool,
  processTransactionTool,
  simulateCallbackTool,

  // Data management
  ...merchantDataTools,

  // Product management
  ...merchantProductTools,

  // Deep links management
  ...merchantDeepLinksTools
];

/**
 * Get tools for merchant partner type
 * @returns {Array} Array of merchant tools with proper grouping names
 */
export function getMerchantTools() {
  return merchantTools.map(tool => {
    let newName = tool.name;

    // Authentication tools use authentication grouping
    if (tool.name.startsWith('payware_authentication_')) {
      newName = tool.name; // Keep authentication grouping
    }
    // Utility tools keep their utils grouping
    else if (tool.name.startsWith('payware_utils_')) {
      newName = tool.name; // Keep utils grouping
    }
    // Operations tools (previously transactions) keep operations grouping
    else if (tool.name.startsWith('payware_operations_')) {
      newName = tool.name; // Keep operations grouping
    }
    // Data tools keep their data grouping
    else if (tool.name.startsWith('payware_data_')) {
      newName = tool.name; // Keep data grouping
    }
    // Product tools keep their products grouping
    else if (tool.name.startsWith('payware_products_')) {
      newName = tool.name; // Keep products grouping
    }
    // Deep links tools keep their deep_links grouping
    else if (tool.name.startsWith('payware_deep_links_')) {
      newName = tool.name; // Keep deep_links grouping
    }

    return {
      ...tool,
      name: newName
    };
  });
}