import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';
import { describeApiError } from '../api-errors.js';

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
  useSandbox = true,
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
    throw describeApiError(error, 'create product');
  }
}

/**
 * Get list of products
 */
export async function getProducts({
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get products');
  }
}

/**
 * Get product information by ID
 */
export async function getProduct({
  productId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get product');
  }
}

const present = value => value !== undefined && value !== null;
const compact = obj => Object.fromEntries(Object.entries(obj).filter(([, value]) => present(value)));

/** A zoned date-time the server printed ("2026-11-10T10:00:00+02:00[Europe/Sofia]") as it reads one back. */
const zonedToInput = value => (value ? String(value).slice(0, 19).replace('T', ' ') : undefined);

/** An instant ("2026-11-10T08:00:00.000+00:00" or epoch millis) as "yyyy-MM-dd HH:mm:ss" in a time zone. */
function instantToInput(value, timeZone) {
  if (!present(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  // sv-SE formats as "2026-11-10 10:00:00".
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(date);
}

/**
 * The ProductRequest that keeps a product exactly as the server returned it (ProductDTO, flat) - the
 * base a partial update is laid over.
 *
 * Why every field is sent: ProductRequest, ProductData and ScheduleRequest give their fields
 * @Builder.Default values (active, shippable, quickPay "FALSE"; price "0.00", type ITEM, time zone UTC,
 * time to live 86400; a 0% discount and today's date), which Jackson applies to a field the request
 * leaves out, and the update prefers any non-null request value over the stored one
 * (ProductService.formUpdateProductValidationRequest, ScheduleService.formUpdateScheduleDto). So a PATCH
 * carrying only a new name also switched the product off and reset its type, time zone and time to
 * live. A server defect; until it is fixed, read first and send everything.
 */
export function productRequestFrom(dto) {
  const flag = value => (present(value) ? (value ? 'TRUE' : 'FALSE') : undefined);
  return compact({
    shop: dto.shopCode,
    name: dto.name,
    shortDescription: dto.shortDescription,
    longDescription: dto.longDescription,
    sku: dto.sku,
    upc: dto.upc,
    shippable: flag(dto.shippable),
    quickPay: flag(dto.quickPay),
    active: flag(dto.active),
    prData: compact({
      type: dto.type,
      regularPrice: dto.regularPrice,
      currency: dto.currencyCode,
      overlapPriority: dto.overlapPriority,
      timeZone: dto.timeZone,
      timeToLive: present(dto.timeToLive) ? String(dto.timeToLive) : undefined,
      activeFrom: zonedToInput(dto.activeFromZoned),
      activeTo: zonedToInput(dto.activeToZoned)
    }),
    prOptions: compact({ imageUrl: dto.imageUrl, termsUrl: dto.termsUrl, termsText: dto.termsText })
  });
}

/** The ScheduleRequest that keeps a schedule as the server returned it (ScheduleDTO), in the product's time zone. */
export function scheduleRequestFrom(dto, timeZone) {
  return compact({
    description: dto.description,
    priceCorrection: dto.priceCorrection,
    correctionType: dto.correctionType,
    correctionValue: present(dto.correctionValue) ? String(dto.correctionValue) : undefined,
    dateFrom: instantToInput(dto.dateFrom, timeZone),
    dateTo: instantToInput(dto.dateTo, timeZone)
  });
}

/**
 * Update product: read it, lay the requested changes over it, send the whole product (see
 * productRequestFrom for why a partial body is not safe).
 */
export async function updateProduct({
  productId,
  name,
  shortDescription,
  longDescription,
  sku,
  upc,
  shippable,
  quickPay,
  active,
  shop,
  prData = {},
  prOptions = {},
  partnerType,
  useSandbox = true,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const current = await getProduct({ productId, partnerType, useSandbox, ...authParams });
  const base = productRequestFrom(current.data || {});
  const requestBody = {
    ...base,
    ...compact({ name, shop, shortDescription, longDescription, sku, upc, shippable, quickPay, active }),
    prData: { ...(base.prData || {}), ...compact(prData || {}) },
    prOptions: { ...(base.prOptions || {}), ...compact(prOptions || {}) }
  };

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
    throw describeApiError(error, 'update product');
  }
}

/**
 * Delete product
 */
export async function deleteProduct({
  productId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'delete product');
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
  useSandbox = true,
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
    throw describeApiError(error, 'get product image');
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
  useSandbox = true,
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
    throw describeApiError(error, 'create price schedule');
  }
}

/**
 * Get product schedules
 */
export async function getProductSchedules({
  productId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get product schedules');
  }
}

/**
 * Get schedule information
 */
export async function getSchedule({
  productId,
  scheduleId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get schedule');
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
  useSandbox = true,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!scheduleId) {
    throw new Error('scheduleId is required');
  }

  // Read the product (for its time zone, in which the schedule's dates are written back) and the
  // schedule, then send the whole schedule: see productRequestFrom for why a partial body is not safe.
  const product = await getProduct({ productId, partnerType, useSandbox, ...authParams });
  const current = await getSchedule({ productId, scheduleId, partnerType, useSandbox, ...authParams });
  const requestBody = {
    ...scheduleRequestFrom(current.data || {}, product.data?.timeZone),
    ...compact({ description, priceCorrection, correctionType, correctionValue, dateFrom, dateTo })
  };

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
    throw describeApiError(error, 'update schedule');
  }
}

/**
 * Delete price schedule
 */
export async function deletePriceSchedule({
  productId,
  scheduleId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'delete schedule');
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
  useSandbox = true,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioFile && !audioPath) {
    throw new Error('Either audioFile buffer or audioPath is required');
  }

  // Node 18's own FormData and Blob: the form-data package this used was never a declared dependency.
  const formData = new FormData();

  if (audioFile) {
    formData.append('file', new Blob([audioFile]), 'audio');
  } else if (audioPath) {
    const { readFileSync } = await import('fs');
    const { basename } = await import('path');
    formData.append('file', new Blob([readFileSync(audioPath)]), basename(audioPath));
  }

  const headers = await createMultipartAuthHeaders(partnerType, authParams);
  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

  try {
    const response = await axios.post(
      `${baseUrl}/products/${productId}/audios/upload`,
      formData,
      {
        // axios sets the multipart Content-Type with its boundary for a native FormData
        headers
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
    throw describeApiError(error, 'register audio');
  }
}

/**
 * Get product audios
 */
export async function getProductAudios({
  productId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get product audios');
  }
}

/**
 * Get audio information
 */
export async function getAudio({
  productId,
  audioId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'get audio');
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
  useSandbox = true,
  ...authParams
}) {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!audioId) {
    throw new Error('audioId is required');
  }

  // PATCH is metadata only. The server refuses a different productId there with
  // ERR_AUDIO_REASSIGN_FORBIDDEN and moves an audio through POST .../{id}/transfer instead
  // (AudioService.update), so a rename and a move are two calls. The rename goes first: if the move
  // is then refused, the title the caller asked for is still applied.
  const move = newProductId !== undefined && newProductId !== productId;
  if (title === undefined && !move) {
    throw new Error('Nothing to update: provide a title, or a newProductId different from productId');
  }

  const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
  const audioUrl = `${baseUrl}/products/${productId}/audios/${audioId}`;

  const send = async (method, url, requestBody, operation) => {
    const minimizedBody = createMinimizedJSON(requestBody);
    const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });
    try {
      const response = await axios[method](url, minimizedBody, { headers });
      return {
        success: true,
        data: response.data,
        requestInfo: {
          url,
          method: method.toUpperCase(),
          requestBody: minimizedBody,
          statusCode: response.status
        }
      };
    } catch (error) {
      throw describeApiError(error, operation);
    }
  };

  let result;
  if (title !== undefined) {
    result = await send('patch', audioUrl, { title }, 'update audio');
  }
  if (move) {
    result = await send('post', `${audioUrl}/transfer`, { targetProductId: newProductId }, 'transfer audio');
  }
  return result;
}

/**
 * Delete audio
 */
export async function deleteAudio({
  productId,
  audioId,
  partnerType,
  useSandbox = true,
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
    throw describeApiError(error, 'delete audio');
  }
}