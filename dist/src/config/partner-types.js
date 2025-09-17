/**
 * Partner type definitions and configurations for payware MCP
 */

export const PARTNER_TYPES = {
  MERCHANT: 'merchant',
  ISV: 'isv',
  PAYMENT_INSTITUTION: 'payment_institution'
};

export const PARTNER_TYPE_CONFIGS = {
  [PARTNER_TYPES.MERCHANT]: {
    name: 'Merchant',
    description: 'Direct businesses accepting payments',
    authType: 'standard_jwt', // iss=partnerId, aud="https://payware.eu"
    capabilities: [
      'transaction_create',
      'transaction_status',
      'transaction_cancel',
      'transaction_history',
      'products_api',
      'data_api',
      'soundbites'
    ],
    requiredEnvVars: [
      'PAYWARE_PARTNER_ID',
      'PAYWARE_PRIVATE_KEY_PATH'
    ]
  },

  [PARTNER_TYPES.ISV]: {
    name: 'Independent Software Vendor',
    description: 'Software providers serving multiple merchants',
    authType: 'oauth2_jwt', // iss=isvId, aud=merchantId, sub=oauth2Token
    capabilities: [
      'oauth2_management',
      'merchant_onboarding',
      'merchant_management',
      'transaction_create_for_merchant',
      'multi_merchant_operations',
      'products_api',
      'data_api',
      'soundbites'
    ],
    requiredEnvVars: [
      'PAYWARE_PARTNER_ID',
      'PAYWARE_PRIVATE_KEY_PATH',
      'PAYWARE_OAUTH_CLIENT_ID',
      'PAYWARE_OAUTH_CLIENT_SECRET'
    ],
    optionalEnvVars: [
      'PAYWARE_DEFAULT_MERCHANT_ID'
    ]
  },

  [PARTNER_TYPES.PAYMENT_INSTITUTION]: {
    name: 'Payment Institution',
    description: 'Banks, e-wallets, and financial institutions',
    authType: 'standard_jwt', // iss=partnerId, aud="https://payware.eu"
    capabilities: [
      'consumer_payment_processing',
      'p2p_payments',
      'cross_institution_transfers',
      'transaction_verification',
      'data_api',
      'soundbites'
    ],
    requiredEnvVars: [
      'PAYWARE_PARTNER_ID',
      'PAYWARE_PRIVATE_KEY_PATH'
    ]
  }
};

/**
 * Get partner type configuration
 * @param {string} partnerType - The partner type
 * @returns {Object} Partner type configuration
 * @throws {Error} If partner type is invalid
 */
export function getPartnerConfig(partnerType) {
  const config = PARTNER_TYPE_CONFIGS[partnerType];
  if (!config) {
    throw new Error(`Invalid partner type: ${partnerType}. Valid types: ${Object.keys(PARTNER_TYPE_CONFIGS).join(', ')}`);
  }
  return config;
}

/**
 * Check if partner type has specific capability
 * @param {string} partnerType - The partner type
 * @param {string} capability - The capability to check
 * @returns {boolean} True if partner has capability
 */
export function hasCapability(partnerType, capability) {
  try {
    const config = getPartnerConfig(partnerType);
    return config.capabilities.includes(capability);
  } catch {
    return false;
  }
}

/**
 * Get authentication type for partner
 * @param {string} partnerType - The partner type
 * @returns {string} Authentication type
 */
export function getAuthType(partnerType) {
  const config = getPartnerConfig(partnerType);
  return config.authType;
}

/**
 * Validate partner type
 * @param {string} partnerType - The partner type to validate
 * @returns {boolean} True if valid
 */
export function isValidPartnerType(partnerType) {
  return Object.values(PARTNER_TYPES).includes(partnerType);
}

/**
 * Get all valid partner types
 * @returns {string[]} Array of valid partner types
 */
export function getValidPartnerTypes() {
  return Object.values(PARTNER_TYPES);
}

/**
 * Get partner type display information
 * @param {string} partnerType - The partner type
 * @returns {Object} Display information with name and description
 */
export function getPartnerDisplayInfo(partnerType) {
  const config = getPartnerConfig(partnerType);
  return {
    type: partnerType,
    name: config.name,
    description: config.description
  };
}