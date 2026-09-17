import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../api-errors.js';

/**
 * Logs API - Premium Feature
 * Provides access to application logs for debugging and monitoring.
 * Requires Premium (PRM) plan subscription.
 */

/**
 * Available log levels for filtering
 */
export const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * Create authentication headers for logs API
 * @param {string} partnerType - merchant, isv, or payment_institution
 * @param {Object} authParams - Authentication parameters
 * @returns {Object} Headers for API request
 */
async function createAuthHeaders(partnerType, authParams) {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  let tokenData;

  switch (partnerType) {
    case 'merchant':
    case 'payment_institution':
      // Standard JWT authentication
      tokenData = createJWTToken(
        authParams.partnerId,
        authParams.privateKey,
        authParams.requestBody
      );
      break;

    case 'isv':
      // ISV JWT with OAuth2
      tokenData = await createJWTForPartner({
        partnerId: authParams.isvPartnerId,
        privateKey: authParams.privateKey,
        merchantId: authParams.merchantPartnerId,
        oauth2Token: authParams.oauth2Token,
        requestBody: authParams.requestBody
      });
      break;

    default:
      throw new Error(`Unknown partner type: ${partnerType}`);
  }

  return {
    ...baseHeaders,
    'Authorization': `Bearer ${tokenData.token}`
  };
}

/**
 * Handle 403 errors with Premium plan messaging
 */
function handleLogsError(error, operation) {
  if (error.response?.status === 403) {
    throw new Error(
      `Access denied: Logs API requires Premium (PRM) plan. ` +
      `Please upgrade your subscription to access application logs. ` +
      `Original error: ${error.response?.data?.message || 'Forbidden'}`
    );
  }
  throw describeApiError(error, '${operation}');
}

/**
 * Query logs with filters
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Log query response
 */
export async function queryLogs({
  from,
  to,
  level,
  logger,
  search,
  limit = 1000,
  cursor,
  partnerType,
  ...authParams
}) {
  const headers = await createAuthHeaders(partnerType, authParams);

  // Build query parameters
  const queryParams = new URLSearchParams();
  if (from) queryParams.append('from', from);
  if (to) queryParams.append('to', to);
  if (level) queryParams.append('level', level);
  if (logger) queryParams.append('logger', logger);
  if (search) queryParams.append('search', search);
  if (limit) queryParams.append('limit', limit.toString());
  if (cursor) queryParams.append('cursor', cursor);

  const queryString = queryParams.toString();
  const url = `${getProductionUrl()}/logs${queryString ? '?' + queryString : ''}`;

  try {
    const response = await axios.get(url, { headers });

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    handleLogsError(error, 'query logs');
  }
}

/**
 * Get log status (availability and storage info)
 * @param {Object} params - Authentication parameters
 * @returns {Promise<Object>} Log status response
 */
export async function getLogStatus({
  partnerType,
  ...authParams
}) {
  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/logs/status`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/logs/status`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    handleLogsError(error, 'get log status');
  }
}

/**
 * Get download URL for logs archive
 * @param {Object} params - Query parameters for date range
 * @returns {Promise<Object>} Download URL information
 */
export async function getLogDownloadUrl({
  from,
  to,
  partnerType,
  ...authParams
}) {
  // Build query parameters for the download URL
  const queryParams = new URLSearchParams();
  if (from) queryParams.append('from', from);
  if (to) queryParams.append('to', to);

  const queryString = queryParams.toString();
  const downloadUrl = `${getProductionUrl()}/logs/download${queryString ? '?' + queryString : ''}`;

  // Note: The actual download requires authentication headers
  // This returns the URL structure that would be used
  return {
    success: true,
    data: {
      downloadUrl,
      note: 'Use this URL with proper JWT authentication headers to download logs as gzipped JSON',
      parameters: {
        from: from || 'default (24 hours ago)',
        to: to || 'default (now)'
      }
    },
    requestInfo: {
      url: downloadUrl,
      method: 'GET (with auth headers)'
    }
  };
}

/**
 * Download logs as compressed archive
 * @param {Object} params - Query parameters for date range
 * @returns {Promise<Object>} Downloaded log data
 */
export async function downloadLogs({
  from,
  to,
  partnerType,
  ...authParams
}) {
  const headers = await createAuthHeaders(partnerType, authParams);

  // Build query parameters
  const queryParams = new URLSearchParams();
  if (from) queryParams.append('from', from);
  if (to) queryParams.append('to', to);

  const queryString = queryParams.toString();
  const url = `${getProductionUrl()}/logs/download${queryString ? '?' + queryString : ''}`;

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    return {
      success: true,
      data: response.data,
      contentType: response.headers['content-type'],
      contentDisposition: response.headers['content-disposition'],
      contentLength: response.headers['content-length'],
      requestInfo: {
        url,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    handleLogsError(error, 'download logs');
  }
}
