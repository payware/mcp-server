/**
 * ISV Products Tools
 * Complete implementation of the Products API for ISVs
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
 * All ISV product tools
 */
export const isvProductTools = [
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
 * Get ISV product tools with proper naming
 * @returns {Array} Array of ISV product tools
 */
export function getISVProductTools() {
  return isvProductTools;
}