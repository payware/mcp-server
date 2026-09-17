/**
 * Payment Institution partner tools registry
 * Tools available for banks, e-wallets, and financial institutions
 *
 * Features specific to Payment Institutions:
 * - Role-based transactions (SRC/DST)
 * - Account and friendlyName requirements
 * - Transaction processing and finalization
 * - P2P cross-institution payments
 * - Extended TTL ranges (up to 30 days)
 * - Soundbite transaction support
 * - Transaction history access
 * - Callback handling (TRANSACTION_PROCESSED, TRANSACTION_FINALIZED)
 */

// Import payment institution specific transaction tools
import { createPITransactionTool } from './transactions/create-pi-transaction.js';
import { processPITransactionTool } from './transactions/process-pi-transaction.js';
import { finalizeTransactionTool } from './transactions/finalize-transaction.js';
import { getPITransactionStatusTool } from './transactions/get-transaction-status.js';
import { getPITransactionHistoryTool } from './transactions/get-transaction-history.js';
import { soundbiteTransactionTool } from './transactions/soundbite-transaction.js';
import { simulatePICallbackTool } from './transactions/simulate-pi-callback.js';

// Data tools
import { paymentInstitutionDataTools } from './data/index.js';

// Deep links tools
import { paymentInstitutionDeepLinksTools } from './deep-links/index.js';

// Import shared tools
import { sharedTools } from '../shared/index.js';

/**
 * Payment Institution specific tools
 * Includes role-based transactions, P2P flows, and PI-specific operations
 */
export const paymentInstitutionTools = [
  // Shared tools (authentication, utilities, etc.)
  ...sharedTools,

  // PI-specific transaction tools
  createPITransactionTool,
  processPITransactionTool,
  finalizeTransactionTool,
  getPITransactionStatusTool,
  getPITransactionHistoryTool,
  soundbiteTransactionTool,
  simulatePICallbackTool,

  // Data management
  ...paymentInstitutionDataTools,

  // Deep links management
  ...paymentInstitutionDeepLinksTools
];

/**
 * Get tools for Payment Institution partner type with proper grouping
 * @returns {Array} Array of Payment Institution tools with grouped names
 */
export function getPaymentInstitutionTools() {
  return paymentInstitutionTools.map(tool => {
    let newName = tool.name;

    // Authentication tools use authentication grouping
    if (tool.name.startsWith('payware_authentication_')) {
      newName = tool.name; // Keep authentication grouping
    }
    // Utility tools keep their utils grouping
    else if (tool.name.startsWith('payware_utils_')) {
      newName = tool.name; // Keep utils grouping
    }
    // Operations tools (PI-specific transaction operations) keep operations grouping
    else if (tool.name.startsWith('payware_operations_')) {
      newName = tool.name; // Keep operations grouping
    }
    // Data tools keep their data grouping
    else if (tool.name.startsWith('payware_data_')) {
      newName = tool.name; // Keep data grouping
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