/**
 * ISV Deep Links Tools
 * Deep link management for ISVs acting on behalf of merchants
 */

import { getTransactionLinkTool } from './get-transaction-link.js';
import { getProductLinkTool } from './get-product-link.js';
import { deleteTransactionLinkTool } from './delete-transaction-link.js';
import { deleteProductLinkTool } from './delete-product-link.js';

export const isvDeepLinksTools = [
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