/**
 * POI (Point of Interaction) tools for ISV partners
 * Enables management of physical payment points with dynamic pricing
 */

import { listPOIsTool } from './list-pois.js';
import { getPOITool } from './get-poi.js';
import { getPOIStatusTool } from './get-status.js';
import { setPOIPriceTool } from './set-price.js';
import { cancelPOIPriceTool } from './cancel-price.js';
import { getPOIQRCodeTool } from './get-qrcode.js';

/**
 * All POI tools for ISV
 */
export const isvPOITools = [
  listPOIsTool,
  getPOITool,
  getPOIStatusTool,
  setPOIPriceTool,
  cancelPOIPriceTool,
  getPOIQRCodeTool
];

export {
  listPOIsTool,
  getPOITool,
  getPOIStatusTool,
  setPOIPriceTool,
  cancelPOIPriceTool,
  getPOIQRCodeTool
};
