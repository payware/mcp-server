import axios from 'axios';
import FormData from 'form-data';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';

/**
 * Product types
 */
export const PRODUCT_TYPES = {
  ITEM: 'ITEM',
  SERVICE: 'SERVICE'
};

/**
 * Price correction types for schedules
 */
export const PRICE_CORRECTION_TYPES = {
  DISCOUNT: 'DISCOUNT',
  INCREMENT: 'INCREMENT'
};

/**
 * Correction methods for schedules
 */
export const CORRECTION_TYPES = {
  PERCENTAGE: 'PERCENTAGE',
  VALUE: 'VALUE'
};

/**
 * Overlap priority options
 */
export const OVERLAP_PRIORITY = {
  LOWEST: 'LOWEST',
  HIGHEST: 'HIGHEST'
};

/**
 * QR code error correction levels
 */
export const QR_ERROR_CORRECTION = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  QUARTILE: 'QUARTILE',
  HIGH: 'HIGH'
};

/**
 * Image formats
 */
export const IMAGE_FORMATS = {
  PNG: 'PNG',
  SVG: 'SVG',
  JPG: 'JPG'
};

/**
 * Image types
 */
export const IMAGE_TYPES = {
  QR: 'QR',
  BARCODE: 'BARCODE'
};

/**
 * Barcode human readable locations
 */
export const BARCODE_LOCATIONS = {
  NONE: 'NONE',
  BOTTOM: 'BOTTOM',
  TOP: 'TOP'
};

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
 * Create authentication headers for multipart/form-data requests
 */
async function createMultipartAuthHeaders(partnerType, authParams) {
  const headers = await createAuthHeaders(partnerType, authParams);
  // Remove Content-Type to let axios set it with boundary for multipart
  delete headers['Content-Type'];
  return headers;
}

// ====================
// PRODUCT MANAGEMENT
// ====================

/**
 * Create a new product
 */
export async function createProduct({
  name,
  shortDescription,
  longDescription,
  sku,
  upc,
  shippable = 'FALSE',
  active = 'FALSE',
  shop,
  prData = {},
  prOptions = {},
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!name) {
    throw new Error('Product name is required');
  }

  const requestBody = {
    name,
    shippable,
    active
  };

  // Optional fields
  if (shop) requestBody.shop = shop;
  if (shortDescription) requestBody.shortDescription = shortDescription;
  if (longDescription) requestBody.longDescription = longDescription;
  if (sku) requestBody.sku = sku;
  if (upc) requestBody.upc = upc;
  if (Object.keys(prData).length > 0) requestBody.prData = prData;
  if (Object.keys(prOptions).length > 0) requestBody.prOptions = prOptions;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.post(
      `${baseUrl}/products`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products`,
        method: 'POST',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to create product: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get list of products
 */
export async function getProducts({
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get products: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get product information by ID
 */
export async function getProduct({
  productId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products/${productId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get product: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update product
 */
export async function updateProduct({
  productId,
  name,
  shortDescription,
  longDescription,
  sku,
  upc,
  shippable,
  active,
  shop,
  prData = {},
  prOptions = {},
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const requestBody = {};

  // Only include fields that are provided
  if (name !== undefined) requestBody.name = name;
  if (shop !== undefined) requestBody.shop = shop;
  if (shortDescription !== undefined) requestBody.shortDescription = shortDescription;
  if (longDescription !== undefined) requestBody.longDescription = longDescription;
  if (sku !== undefined) requestBody.sku = sku;
  if (upc !== undefined) requestBody.upc = upc;
  if (shippable !== undefined) requestBody.shippable = shippable;
  if (active !== undefined) requestBody.active = active;
  if (Object.keys(prData).length > 0) requestBody.prData = prData;
  if (Object.keys(prOptions).length > 0) requestBody.prOptions = prOptions;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.patch(
      `${baseUrl}/products/${productId}`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}`,
        method: 'PATCH',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to update product: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete product
 */
export async function deleteProduct({
  productId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.delete(
      `${baseUrl}/products/${productId}`,
      { headers }
    );

    return {
      success: true,
      requestInfo: {
        url: `${baseUrl}/products/${productId}`,
        method: 'DELETE',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to delete product: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Generate product image (QR code or barcode)
 */
export async function getProductImage({
  productId,
  type = IMAGE_TYPES.QR,
  qrOptions = {},
  barOptions = {},
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const requestBody = {
    type
  };

  if (type === IMAGE_TYPES.QR && Object.keys(qrOptions).length > 0) {
    requestBody.qrOptions = qrOptions;
  }
  if (type === IMAGE_TYPES.BARCODE && Object.keys(barOptions).length > 0) {
    requestBody.barOptions = barOptions;
  }

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.post(
      `${baseUrl}/products/${productId}/image`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/image`,
        method: 'POST',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get product image: ${error.response?.data?.message || error.message}`);
  }
}

// ====================
// PRICE SCHEDULES
// ====================

/**
 * Create price schedule for a product
 */
export async function createPriceSchedule({
  productId,
  description,
  priceCorrection = PRICE_CORRECTION_TYPES.DISCOUNT,
  correctionType = CORRECTION_TYPES.PERCENTAGE,
  correctionValue = '0.00',
  dateFrom,
  dateTo,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const requestBody = {
    priceCorrection,
    correctionType,
    correctionValue
  };

  if (description) requestBody.description = description;
  if (dateFrom) requestBody.dateFrom = dateFrom;
  if (dateTo) requestBody.dateTo = dateTo;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.post(
      `${baseUrl}/products/${productId}/schedules`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/schedules`,
        method: 'POST',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to create price schedule: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get product schedules
 */
export async function getProductSchedules({
  productId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products/${productId}/schedules`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/schedules`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get product schedules: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get schedule information
 */
export async function getSchedule({
  productId,
  scheduleId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!scheduleId) {
    throw new Error('scheduleId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get schedule: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update price schedule
 */
export async function updatePriceSchedule({
  productId,
  scheduleId,
  description,
  priceCorrection,
  correctionType,
  correctionValue,
  dateFrom,
  dateTo,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!scheduleId) {
    throw new Error('scheduleId is required');
  }

  const requestBody = {};

  if (description !== undefined) requestBody.description = description;
  if (priceCorrection !== undefined) requestBody.priceCorrection = priceCorrection;
  if (correctionType !== undefined) requestBody.correctionType = correctionType;
  if (correctionValue !== undefined) requestBody.correctionValue = correctionValue;
  if (dateFrom !== undefined) requestBody.dateFrom = dateFrom;
  if (dateTo !== undefined) requestBody.dateTo = dateTo;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.patch(
      `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
        method: 'PATCH',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to update schedule: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete price schedule
 */
export async function deletePriceSchedule({
  productId,
  scheduleId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!scheduleId) {
    throw new Error('scheduleId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.delete(
      `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
      { headers }
    );

    return {
      success: true,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/schedules/${scheduleId}`,
        method: 'DELETE',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to delete schedule: ${error.response?.data?.message || error.message}`);
  }
}

// ====================
// AUDIO/SOUNDBITE MANAGEMENT
// ====================

/**
 * Register audio file for a product
 */
export async function registerAudio({
  productId,
  audioFile,
  audioPath,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioFile && !audioPath) {
    throw new Error('Either audioFile buffer or audioPath is required');
  }

  const formData = new FormData();

  if (audioFile) {
    formData.append('file', audioFile);
  } else if (audioPath) {
    const fs = await import('fs');
    formData.append('file', fs.createReadStream(audioPath));
  }

  const headers = await createMultipartAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.post(
      `${baseUrl}/products/${productId}/audios/upload`,
      formData,
      {
        headers: {
          ...headers,
          ...formData.getHeaders()
        }
      }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/audios/upload`,
        method: 'POST',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to register audio: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get product audios
 */
export async function getProductAudios({
  productId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products/${productId}/audios`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/audios`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get product audios: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get audio information
 */
export async function getAudio({
  productId,
  audioId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioId) {
    throw new Error('audioId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.get(
      `${baseUrl}/products/${productId}/audios/${audioId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/audios/${audioId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get audio: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update audio information
 */
export async function updateAudio({
  productId,
  audioId,
  title,
  newProductId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioId) {
    throw new Error('audioId is required');
  }

  const requestBody = {};

  if (title !== undefined) requestBody.title = title;
  if (newProductId !== undefined) requestBody.productId = newProductId;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.patch(
      `${baseUrl}/products/${productId}/audios/${audioId}`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/audios/${audioId}`,
        method: 'PATCH',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to update audio: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete audio
 */
export async function deleteAudio({
  productId,
  audioId,
  partnerType,
  useSandbox = false,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioId) {
    throw new Error('audioId is required');
  }

  const headers = await createAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.delete(
      `${baseUrl}/products/${productId}/audios/${audioId}`,
      { headers }
    );

    return {
      success: true,
      requestInfo: {
        url: `${baseUrl}/products/${productId}/audios/${audioId}`,
        method: 'DELETE',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to delete audio: ${error.response?.data?.message || error.message}`);
  }
}