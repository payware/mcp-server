/**
 * ISV-specific authentication utilities
 * Handles OAuth2 and JWT token creation for ISV partners
 */

import { createJWTForPartner, getAuthHeaders } from '../../core/auth/jwt-factory.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Create ISV JWT token for API requests
 * @param {Object} options - JWT creation options
 * @param {string} options.merchantPartnerId - Target merchant partner ID (required for API calls)
 * @param {string} options.oauth2Token - OAuth2 token (required for API calls)
 * @param {Object} options.requestBody - Request body for POST/PUT/PATCH requests
 * @param {string} options.audience - JWT audience (defaults to merchant partner ID, or https://payware.eu for OAuth2 requests)
 * @param {boolean} options.isOAuth2Request - Set to true for OAuth2 endpoint requests
 * @param {boolean} options.isGetRequest - Set to true for GET requests (no body)
 * @returns {string} JWT token string
 */
export async function createISVJWT(options = {}) {
  const {
    merchantPartnerId,
    oauth2Token,
    requestBody = null,
    audience = null,
    isOAuth2Request = false,
    isGetRequest = false
  } = options;

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe();

  // For OAuth2 requests, we need special handling
  if (isOAuth2Request) {
    return await createOAuth2JWT({
      isvPartnerId,
      privateKey,
      requestBody,
      audience: audience || 'https://payware.eu'
    });
  }

  // For regular API requests, we need merchant partner ID and OAuth2 token
  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV API requests');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV API requests');
  }

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody: isGetRequest ? null : requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  return jwtData.token;
}

/**
 * Create JWT specifically for OAuth2 endpoint requests
 * @param {Object} options - OAuth2 JWT options
 * @returns {string} JWT token string
 */
async function createOAuth2JWT({ isvPartnerId, privateKey, requestBody, audience }) {
  // Dynamic imports to avoid circular dependencies
  const jwt = await import('jsonwebtoken');
  const crypto = await import('crypto');
  const { normalizePrivateKey } = await import('../../core/utils/key-utils.js');

  const normalizedKey = normalizePrivateKey(privateKey);
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add contentSha256 to header if request body exists (SHA-256 is preferred over MD5)
  if (requestBody) {
    // Use standard JSON.stringify to match axios serialization (preserves property order)
    const bodyString = JSON.stringify(requestBody);
    header.contentSha256 = crypto.default.createHash('sha256').update(bodyString, 'utf8').digest('base64');
  }

  // JWT Payload for OAuth2 requests
  const payload = {
    iss: isvPartnerId,           // ISV's partner ID
    aud: audience,               // https://payware.eu for OAuth2 requests
    iat: now
  };

  const token = jwt.default.sign(payload, normalizedKey, {
    algorithm: 'RS256',
    header: header
  });

  return token;
}

/**
 * Create authentication headers for ISV requests
 * @param {string} jwt - JWT token
 * @param {boolean} isOAuth2Request - Whether this is for OAuth2 endpoints (no Api-Version header)
 * @returns {Object} Headers object with Authorization and Content-Type
 */
export function createISVAuthHeaders(jwt, isOAuth2Request = false) {
  if (isOAuth2Request) {
    // OAuth2 endpoints don't need Api-Version header
    return {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    };
  }

  // Regular API endpoints need Api-Version header
  return getAuthHeaders(jwt);
}

/**
 * Validate ISV request parameters
 * @param {Object} params - Parameters to validate
 * @param {boolean} params.requireMerchant - Whether merchant partner ID is required
 * @param {boolean} params.requireToken - Whether OAuth2 token is required
 * @throws {Error} If validation fails
 */
export function validateISVParams({ merchantPartnerId, oauth2Token, requireMerchant = true, requireToken = true }) {
  if (requireMerchant && !merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (requireToken && !oauth2Token) {
    throw new Error('OAuth2 token is required for ISV API operations');
  }

  // Validate partner ID format (basic validation)
  if (merchantPartnerId && !/^[A-Z0-9]{8}$/.test(merchantPartnerId)) {
    console.warn('Merchant Partner ID should be 8 alphanumeric characters (e.g., "PZAYNMVE")');
  }
}

/**
 * Extract partner information from ISV context
 * @returns {Object} Partner information
 */
export function getISVPartnerInfo() {
  const partnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe();

  return {
    isvPartnerId: partnerId,
    hasPrivateKey: !!privateKey,
    partnerType: 'isv'
  };
}