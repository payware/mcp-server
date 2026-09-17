/**
 * Shared tools registry
 * Tools available to all partner types
 */

// Import utility tools that remain shared
import { generateCodeExampleTool, generateDocumentationTool } from '../tools/advanced-code-generator.js';
import { formatRequestTool } from '../utils/format-request.js';
import { getServerInfoTool } from '../utils/server-info.js';
import { formatJSONDeterministicTool } from '../utils/json-formatter.js';

// Import auth tools that remain shared
import { generateRSAKeysTool } from '../auth/rsa-keys.js';
import { createJWTTokenTool, validateJWTTokenTool, testJWTTokenTool } from '../core/auth/jwt-token.js';
import { setupSandboxAuthTool } from '../auth/sandbox-setup.js';

/**
 * Tools shared across all partner types
 */
export const sharedTools = [
  // Authentication tools
  generateRSAKeysTool,
  createJWTTokenTool,
  validateJWTTokenTool,
  testJWTTokenTool,
  setupSandboxAuthTool,

  // Code generation tools
  generateCodeExampleTool,
  generateDocumentationTool,

  // Utility tools
  formatRequestTool,
  getServerInfoTool,
  formatJSONDeterministicTool
];

/**
 * Get shared tools with proper naming
 * @returns {Array} Array of shared tools
 */
export function getSharedTools() {
  return sharedTools;
}