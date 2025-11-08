/**
 * ISV (Independent Software Vendor) partner tools registry
 * Tools available for ISVs serving multiple merchants
 */

// OAuth2 tools
import { obtainTokenTool } from './oauth2/obtain-token.js';
import { getTokenInfoTool } from './oauth2/get-token-info.js';
import { tokenHelperTool } from './oauth2/token-helper.js';

// Transaction tools
import { createTransactionTool } from './transactions/create-transaction.js';
import { getTransactionStatusTool } from './transactions/get-status.js';
import { cancelTransactionTool } from './transactions/cancel-transaction.js';
import { getTransactionHistoryTool } from './transactions/transaction-history.js';
import { processTransactionTool } from './transactions/process-transaction.js';
import { simulateCallbackTool } from './transactions/simulate-callback.js';

// Data tools
import { isvDataTools } from './data/index.js';

// Product tools
import { isvProductTools } from './products/index.js';

// Deep links tools
import { isvDeepLinksTools } from './deep-links/index.js';

// Import shared tools
import { sharedTools } from '../shared/index.js';

/**
 * All ISV-specific tools
 */
export const isvTools = [
  // Shared tools (authentication, utilities, etc.)
  ...sharedTools,

  // OAuth2 management (ISV-specific)
  obtainTokenTool,
  getTokenInfoTool,
  tokenHelperTool,

  // Transaction management
  createTransactionTool,
  getTransactionStatusTool,
  cancelTransactionTool,
  getTransactionHistoryTool,
  processTransactionTool,
  simulateCallbackTool,

  // Data management
  ...isvDataTools,

  // Product management
  ...isvProductTools,

  // Deep links management
  ...isvDeepLinksTools
];

/**
 * Get tools for ISV partner type with proper grouping
 * @returns {Array} Array of ISV tools with grouped names
 */
export function getISVTools() {
  return isvTools.map(tool => {
    let newName = tool.name;

    // Authentication tools use authentication grouping (shared tools)
    if (tool.name.startsWith('payware_authentication_')) {
      newName = tool.name; // Keep authentication grouping
    }
    // Authorization tools use authorization grouping (ISV-specific OAuth2)
    else if (tool.name.startsWith('payware_authorization_')) {
      newName = tool.name; // Keep authorization grouping
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