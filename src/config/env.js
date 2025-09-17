/**
 * Environment configuration for payware MCP server
 * Supports different partner types: merchant, isv, payment_institution
 */

// Suppress dotenv informational messages that interfere with MCP JSON-RPC transport
process.env.DOTENV_CONFIG_QUIET = 'true';

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env file (silent mode for MCP compatibility)
config({ debug: false });

// Valid partner types
const VALID_PARTNER_TYPES = ['merchant', 'isv', 'payment_institution'];
const DEFAULT_PARTNER_TYPE = 'merchant';

/**
 * Get partner ID from environment
 * @returns {string} Partner ID
 * @throws {Error} If partner ID is not configured
 */
export function getPartnerId() {
  const partnerId = process.env.PAYWARE_PARTNER_ID;
  if (!partnerId) {
    throw new Error('PAYWARE_PARTNER_ID environment variable is required');
  }
  return partnerId;
}

/**
 * Get private key from environment-specified path
 * @param {boolean} useSandbox - Whether to use sandbox environment
 * @returns {string} Private key content
 * @throws {Error} If private key path is not configured or file cannot be read
 */
export function getPrivateKey(useSandbox = true) {
  let privateKeyPath;

  if (useSandbox) {
    privateKeyPath = process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH;
  } else {
    privateKeyPath = process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH;
  }

  if (!privateKeyPath) {
    const envVar = useSandbox ? 'PAYWARE_SANDBOX_PRIVATE_KEY_PATH' : 'PAYWARE_PRODUCTION_PRIVATE_KEY_PATH';
    throw new Error(`${envVar} environment variable is required`);
  }

  try {
    // Resolve path relative to project root
    const fullPath = resolve(privateKeyPath);
    const privateKey = readFileSync(fullPath, 'utf8');
    return privateKey;
  } catch (error) {
    throw new Error(`Cannot read private key from ${privateKeyPath}: ${error.message}`);
  }
}

/**
 * Get sandbox base URL from environment (with default)
 * @returns {string} Sandbox base URL
 */
export function getSandboxUrl() {
  return process.env.PAYWARE_SANDBOX_URL || 'https://sandbox.payware.eu/api';
}

/**
 * Get production base URL from environment (with default)
 * @returns {string} Production base URL
 */
export function getProductionUrl() {
  return process.env.PAYWARE_PRODUCTION_URL || 'https://api.payware.eu/api';
}

/**
 * Get environment configuration object
 * @returns {Object} Configuration object with all environment settings
 */
export function getEnvironmentConfig() {
  return {
    partnerId: getPartnerId(),
    sandboxPrivateKeyPath: process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH,
    productionPrivateKeyPath: process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH,
    sandboxUrl: getSandboxUrl(),
    productionUrl: getProductionUrl(),
    hasSandboxPrivateKey: !!process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH,
    hasProductionPrivateKey: !!process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH,
    configuredAt: new Date().toISOString()
  };
}

/**
 * Get partner ID safely (returns undefined if not configured)
 * @returns {string|undefined} Partner ID or undefined
 */
export function getPartnerIdSafe() {
  try {
    return getPartnerId();
  } catch (error) {
    return undefined;
  }
}

/**
 * Get private key safely (returns undefined if not configured)
 * @param {boolean} useSandbox - Whether to use sandbox environment
 * @returns {string|undefined} Private key content or undefined
 */
export function getPrivateKeySafe(useSandbox = true) {
  try {
    return getPrivateKey(useSandbox);
  } catch (error) {
    return undefined;
  }
}

/**
 * Get partner type from environment
 * @returns {string} Partner type (merchant, isv, or payment_institution)
 */
export function getPartnerType() {
  const partnerType = process.env.PAYWARE_PARTNER_TYPE || DEFAULT_PARTNER_TYPE;

  if (!VALID_PARTNER_TYPES.includes(partnerType)) {
    throw new Error(`Invalid partner type: ${partnerType}. Valid types: ${VALID_PARTNER_TYPES.join(', ')}`);
  }

  return partnerType;
}

/**
 * Get partner type safely (returns default if not configured)
 * @returns {string} Partner type or default
 */
export function getPartnerTypeSafe() {
  try {
    return getPartnerType();
  } catch (error) {
    return DEFAULT_PARTNER_TYPE;
  }
}

/**
 * Check if current partner type is ISV
 * @returns {boolean} True if partner type is ISV
 */
export function isISV() {
  return getPartnerTypeSafe() === 'isv';
}

/**
 * Check if current partner type is Payment Institution
 * @returns {boolean} True if partner type is Payment Institution
 */
export function isPaymentInstitution() {
  return getPartnerTypeSafe() === 'payment_institution';
}

/**
 * Check if current partner type is Merchant
 * @returns {boolean} True if partner type is Merchant
 */
export function isMerchant() {
  return getPartnerTypeSafe() === 'merchant';
}

/**
 * Get OAuth2 client ID for ISV partners
 * @returns {string|undefined} OAuth2 client ID
 */
export function getOAuth2ClientId() {
  if (!isISV()) return undefined;
  return process.env.PAYWARE_OAUTH_CLIENT_ID;
}

/**
 * Get OAuth2 client secret for ISV partners
 * @returns {string|undefined} OAuth2 client secret
 */
export function getOAuth2ClientSecret() {
  if (!isISV()) return undefined;
  return process.env.PAYWARE_OAUTH_CLIENT_SECRET;
}

/**
 * Get default merchant ID for ISV partners
 * @returns {string|undefined} Default merchant ID
 */
export function getDefaultMerchantId() {
  if (!isISV()) return undefined;
  return process.env.PAYWARE_DEFAULT_MERCHANT_ID;
}

/**
 * Validate that all required environment variables are set for the partner type
 * @throws {Error} If any required environment variable is missing
 */
export function validateEnvironment() {
  const partnerType = getPartnerType(); // Will throw if invalid
  getPartnerId(); // Will throw if missing
  getPrivateKey(true); // Will throw if missing or unreadable (check sandbox key)

  // ISV-specific validation
  if (isISV()) {
    if (!getOAuth2ClientId()) {
      throw new Error('PAYWARE_OAUTH_CLIENT_ID is required for ISV partners');
    }
    if (!getOAuth2ClientSecret()) {
      throw new Error('PAYWARE_OAUTH_CLIENT_SECRET is required for ISV partners');
    }
  }

  console.log('✅ Environment configuration validated');
  console.log(`   Partner Type: ${partnerType}`);
  console.log(`   Partner ID: ${getPartnerId()}`);
  console.log(`   Sandbox Private Key: ${process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH ? 'Set' : 'Not set'}`);
  console.log(`   Production Private Key: ${process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH ? 'Set' : 'Not set'}`);
  console.log(`   Sandbox URL: ${getSandboxUrl()}`);
  console.log(`   Production URL: ${getProductionUrl()}`);

  if (isISV()) {
    console.log(`   OAuth2 Client ID: ${getOAuth2ClientId()}`);
    console.log(`   Default Merchant ID: ${getDefaultMerchantId() || 'Not set'}`);
  }
}