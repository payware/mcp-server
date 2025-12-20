/**
 * JWT factory for different partner types
 * Handles the different authentication patterns required by merchant, ISV, and payment institution partners
 */

import { createJWTToken } from './jwt-token.js';
import { getPartnerTypeSafe, isISV, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Create JWT token appropriate for the current partner type
 * @param {Object} options - JWT creation options
 * @param {string} options.partnerId - Partner ID (defaults to env var)
 * @param {string} options.privateKey - Private key (defaults to env var)
 * @param {Object} options.requestBody - Request body for POST/PUT/PATCH requests
 * @param {string} options.merchantId - Target merchant ID (ISV only)
 * @param {string} options.oauth2Token - OAuth2 token (ISV only)
 * @returns {Object} JWT token data
 */
export async function createJWTForPartner(options = {}) {
  const partnerType = getPartnerTypeSafe();
  const {
    partnerId = getPartnerIdSafe(),
    privateKey = getPrivateKeySafe(),
    requestBody = null,
    merchantId = null,
    oauth2Token = null
  } = options;

  switch (partnerType) {
    case 'merchant':
    case 'payment_institution':
      return createStandardJWT({
        partnerId,
        privateKey,
        requestBody
      });

    case 'isv':
      return await createISVJWT({
        isvPartnerId: partnerId,
        merchantPartnerId: merchantId,
        oauth2Token,
        privateKey,
        requestBody
      });

    default:
      throw new Error(`Unsupported partner type: ${partnerType}`);
  }
}

/**
 * Create standard JWT for merchant and payment institution partners
 * @param {Object} options - JWT options
 * @returns {Object} JWT token data
 */
function createStandardJWT({ partnerId, privateKey, requestBody }) {
  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for standard JWT creation');
  }

  return createJWTToken(partnerId, privateKey, requestBody);
}

/**
 * Create ISV JWT with OAuth2 token and merchant audience
 * @param {Object} options - ISV JWT options
 * @returns {Object} JWT token data with ISV-specific claims
 */
async function createISVJWT({ isvPartnerId, merchantPartnerId, oauth2Token, privateKey, requestBody }) {
  if (!isvPartnerId || !privateKey) {
    throw new Error('ISV Partner ID and private key are required for ISV JWT creation');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV JWT creation');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV JWT creation');
  }

  // For ISV, we need to create a custom JWT with different audience and subject
  const now = Math.floor(Date.now() / 1000);

  // Create the JWT with ISV-specific claims
  const payload = {
    iss: isvPartnerId,           // ISV's partner ID
    aud: merchantPartnerId,      // Target merchant's partner ID
    sub: oauth2Token,            // OAuth2 token granting permission
    iat: now
  };

  // Use the base JWT creation with custom payload
  return await createJWTTokenWithCustomPayload(payload, privateKey, requestBody);
}

/**
 * Create JWT token with custom payload (for ISV use case)
 * @param {Object} payload - Custom JWT payload
 * @param {string} privateKey - Private key for signing
 * @param {Object} requestBody - Request body for content MD5
 * @returns {Object} JWT token data
 */
async function createJWTTokenWithCustomPayload(payload, privateKey, requestBody) {
  // Dynamic imports to avoid circular dependencies
  const jwt = await import('jsonwebtoken');
  const crypto = await import('crypto');
  const { normalizePrivateKey } = await import('../utils/key-utils.js');

  const normalizedKey = normalizePrivateKey(privateKey);

  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add contentMd5 to header if request body exists
  if (requestBody) {
    const { createMinimizedJSON } = await import('../utils/json-serializer.js');
    const bodyString = createMinimizedJSON(requestBody);
    header.contentMd5 = crypto.default.createHash('md5').update(bodyString, 'utf8').digest('base64');
  }

  const token = jwt.default.sign(payload, normalizedKey, {
    algorithm: 'RS256',
    header: header
  });

  return {
    token,
    partnerId: payload.iss,
    audience: payload.aud,
    subject: payload.sub,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    contentMd5: header.contentMd5 || null,
    hasBody: !!requestBody,
    isISV: true
  };
}

/**
 * Validate JWT creation parameters based on partner type
 * @param {Object} options - JWT options to validate
 * @throws {Error} If validation fails
 */
export function validateJWTOptions(options = {}) {
  const partnerType = getPartnerTypeSafe();
  const { partnerId, privateKey, merchantId, oauth2Token } = options;

  // Common validation
  if (!partnerId) {
    throw new Error('Partner ID is required');
  }
  if (!privateKey) {
    throw new Error('Private key is required');
  }

  // ISV-specific validation
  if (partnerType === 'isv') {
    if (!merchantId) {
      throw new Error('Merchant ID is required for ISV partner type');
    }
    if (!oauth2Token) {
      throw new Error('OAuth2 token is required for ISV partner type');
    }
  }
}

/**
 * Get authentication headers for API requests
 * @param {string} jwt - JWT token
 * @returns {Object} Headers object
 */
export function getAuthHeaders(jwt) {
  return {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };
}