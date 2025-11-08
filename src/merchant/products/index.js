/**
 * Merchant Products Tools
 * Complete implementation of the Products API for merchants
 */

// Product Management
import { createProductTool } from './create-product.js';
import { listProductsTool } from './list-products.js';
import { getProductTool } from './get-product.js';
import { updateProductTool } from './update-product.js';
import { deleteProductTool } from './delete-product.js';
import { getProductImageTool } from './get-product-image.js';

// Price Schedules
import {
  createScheduleTool,
  getSchedulesTool,
  getScheduleTool,
  updateScheduleTool,
  deleteScheduleTool
} from './schedules.js';

// Audio/Soundbite Management
import {
  registerAudioTool,
  getAudiosTool,
  getAudioTool,
  updateAudioTool,
  deleteAudioTool
} from './audios.js';

/**
 * All merchant product tools
 */
export const merchantProductTools = [
  // Product Management
  createProductTool,
  listProductsTool,
  getProductTool,
  updateProductTool,
  deleteProductTool,
  getProductImageTool,

  // Price Schedules
  createScheduleTool,
  getSchedulesTool,
  getScheduleTool,
  updateScheduleTool,
  deleteScheduleTool,

  // Audio/Soundbite Management
  registerAudioTool,
  getAudiosTool,
  getAudioTool,
  updateAudioTool,
  deleteAudioTool
];

/**
 * Get merchant product tools with proper naming
 * @returns {Array} Array of merchant product tools
 */
export function getMerchantProductTools() {
  return merchantProductTools;
}