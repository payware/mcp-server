import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getProductionUrl } from '../../config/env.js';

/**
 * Create authentication headers based on partner type
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
        authParams.requestBody || ''
      );
      break;

    case 'isv':
      // ISV JWT with OAuth2 - note the parameter mapping
      tokenData = await createJWTForPartner({
        partnerId: authParams.isvPartnerId,
        privateKey: authParams.privateKey,
        merchantId: authParams.merchantPartnerId,  // Map merchantPartnerId to merchantId
        oauth2Token: authParams.oauth2Token,
        requestBody: authParams.requestBody || ''
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
 * Get deep link for a transaction
 * @param {Object} params - Parameters
 * @param {string} params.transactionId - Transaction ID
 * @param {string} params.partnerType - Partner type (merchant, isv, payment_institution)
 * @param {Object} params.authParams - Authentication parameters
 * @returns {Object} Deep link response
 */
export async function getTransactionDeepLink({
  transactionId,
  partnerType,
  ...authParams
}) {
  if (!transactionId) {
    throw new Error('transactionId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/transactions/${transactionId}/link`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/transactions/${transactionId}/link`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get transaction deep link: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get deep link for a product
 * @param {Object} params - Parameters
 * @param {string} params.productId - Product ID
 * @param {string} params.partnerType - Partner type (merchant, isv)
 * @param {Object} params.authParams - Authentication parameters
 * @returns {Object} Deep link response
 */
export async function getProductDeepLink({
  productId,
  partnerType,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  if (partnerType === 'payment_institution') {
    throw new Error('Payment institutions do not manage products');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/products/${productId}/link`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/products/${productId}/link`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get product deep link: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete deep link for a transaction
 * @param {Object} params - Parameters
 * @param {string} params.transactionId - Transaction ID
 * @param {string} params.partnerType - Partner type (merchant, isv, payment_institution)
 * @param {Object} params.authParams - Authentication parameters
 * @returns {Object} Delete response
 */
export async function deleteTransactionDeepLink({
  transactionId,
  partnerType,
  ...authParams
}) {
  if (!transactionId) {
    throw new Error('transactionId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.delete(
      `${getProductionUrl()}/transactions/${transactionId}/link`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/transactions/${transactionId}/link`,
        method: 'DELETE',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to delete transaction deep link: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete deep link for a product
 * @param {Object} params - Parameters
 * @param {string} params.productId - Product ID
 * @param {string} params.partnerType - Partner type (merchant, isv)
 * @param {Object} params.authParams - Authentication parameters
 * @returns {Object} Delete response
 */
export async function deleteProductDeepLink({
  productId,
  partnerType,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  if (partnerType === 'payment_institution') {
    throw new Error('Payment institutions do not manage products');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.delete(
      `${getProductionUrl()}/products/${productId}/link`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/products/${productId}/link`,
        method: 'DELETE',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to delete product deep link: ${error.response?.data?.message || error.message}`);
  }
}