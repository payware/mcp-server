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

// POI tools
import { isvPOITools } from './poi/index.js';

// Shop tools
import { isvShopTools } from './shops/index.js';

// Merchant onboarding: invitations, and the reference data their forms need
import { isvInvitationTools } from './invitations/index.js';
import { isvReferenceTools } from './reference/index.js';

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
  ...isvDeepLinksTools,

  // POI management
  ...isvPOITools,

  // Shop lookup - needed before any call that takes a shopCode
  ...isvShopTools,

  // Merchant onboarding. These come BEFORE a merchant exists, so they authenticate as the ISV
  // itself rather than on behalf of anyone - they are how the merchantPartnerId + oauth2Token pair
  // that every other tool here requires comes into existence in the first place.
  ...isvInvitationTools,
  ...isvReferenceTools
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
    // POI tools keep their poi grouping
    else if (tool.name.startsWith('payware_poi_')) {
      newName = tool.name; // Keep poi grouping
    }
    // Shop tools keep their shops grouping
    else if (tool.name.startsWith('payware_shops_')) {
      newName = tool.name; // Keep shops grouping
    }
    // Merchant onboarding (invitations) keeps its isv grouping
    else if (tool.name.startsWith('payware_isv_')) {
      newName = tool.name; // Keep isv grouping
    }
    // Reference data keeps its reference grouping
    else if (tool.name.startsWith('payware_reference_')) {
      newName = tool.name; // Keep reference grouping
    }

    return {
      ...tool,
      name: newName
    };
  });
}