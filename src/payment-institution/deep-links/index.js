/**
 * Payment Institution Deep Links Tools
 * Deep link management for payment institutions (transaction links only)
 */

import { getTransactionLinkTool } from './get-transaction-link.js';
import { deleteTransactionLinkTool } from './delete-transaction-link.js';

export const paymentInstitutionDeepLinksTools = [
  getTransactionLinkTool,
  deleteTransactionLinkTool
];

export {
  getTransactionLinkTool,
  deleteTransactionLinkTool
};