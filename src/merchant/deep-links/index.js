/**
 * Merchant Deep Links Tools
 * Deep link management for merchants
 */

import { getTransactionLinkTool } from './get-transaction-link.js';
import { getProductLinkTool } from './get-product-link.js';
import { deleteTransactionLinkTool } from './delete-transaction-link.js';
import { deleteProductLinkTool } from './delete-product-link.js';

export const merchantDeepLinksTools = [
  getTransactionLinkTool,
  getProductLinkTool,
  deleteTransactionLinkTool,
  deleteProductLinkTool
];

export {
  getTransactionLinkTool,
  getProductLinkTool,
  deleteTransactionLinkTool,
  deleteProductLinkTool
};