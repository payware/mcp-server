import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Available report types from the Data API documentation
 */
export const REPORT_TYPES = {
  // Standard reports
  CURRENT_WEEK_TRANSACTIONS: '/processedTransactionsWTD',
  CURRENT_MONTH_TRANSACTIONS: '/processedTransactionsMTD',
  CURRENT_YEAR_TRANSACTIONS: '/processedTransactionsYTD',
  PRODUCTS_LIST: '/productsList',
  SHOPS_LIST: '/shopsList',
  SALES_PER_PRODUCT: '/salesPerProduct',
  PAYMENT_PROFILES: '/paymentProfiles',
  TRANSACTIONS_PER_WEBPOS: '/transactionsPerWebPOS',
  PARTNER_PROFILE: '/partnerProfile',

  // Premium reports
  PROCESSED_TRANSACTIONS: '/processedTransactions',
  SCHEDULES_LIST: '/schedulesList',
  TRANSACTIONS_PER_PRODUCT: '/processedTransactionsPerProduct'
};

/**
 * Supported export formats
 */
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  CSV: 'csv',
  EXCEL: 'xlsx',
  JSON: 'json'
};

/**
 * Supported locales
 */
export const LOCALES = {
  ENGLISH_US: 'en_US',
  SPANISH: 'es_ES',
  BULGARIAN: 'bg_BG'
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
      // ISV JWT with OAuth2 - note the parameter mapping
      tokenData = await createJWTForPartner({
        partnerId: authParams.isvPartnerId,
        privateKey: authParams.privateKey,
        merchantId: authParams.merchantPartnerId,  // Map merchantPartnerId to merchantId
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
 * Generate a report asynchronously
 */
export async function generateReport({
  reportUnitId,
  ignorePagination = false,
  locale = LOCALES.ENGLISH_US,
  dateFrom,
  dateTo,
  timeZone = 'GMT',
  partnerType,
  ...authParams
}) {
  if (!reportUnitId) {
    throw new Error('reportUnitId is required (e.g., "/processedTransactions")');
  }

  if (!Object.values(REPORT_TYPES).includes(reportUnitId)) {
    console.warn(`Warning: reportUnitId "${reportUnitId}" is not in the known report types list`);
  }

  if (!Object.values(LOCALES).includes(locale)) {
    throw new Error(`Invalid locale. Supported: ${Object.values(LOCALES).join(', ')}`);
  }

  const requestBody = {
    reportUnitId,
    ignorePagination,
    locale,
    timeZone
  };

  // Add date range if provided
  if (dateFrom) requestBody.dateFrom = dateFrom;
  if (dateTo) requestBody.dateTo = dateTo;

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });

  try {
    const response = await axios.post(
      `${getProductionUrl()}/data-retrieval`,
      minimizedBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval`,
        method: 'POST',
        requestBody: minimizedBody,
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to generate report: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get report generation status
 */
export async function getReportStatus({
  requestId,
  partnerType,
  ...authParams
}) {
  if (!requestId) {
    throw new Error('requestId is required (UUID from report generation)');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/request/${requestId}/status`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/request/${requestId}/status`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get report status: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Export report in specific format
 */
export async function exportReport({
  requestId,
  outputFormat = EXPORT_FORMATS.PDF,
  partnerType,
  ...authParams
}) {
  if (!requestId) {
    throw new Error('requestId is required (UUID from report generation)');
  }

  if (!Object.values(EXPORT_FORMATS).includes(outputFormat)) {
    throw new Error(`Invalid output format. Supported: ${Object.values(EXPORT_FORMATS).join(', ')}`);
  }

  const requestBody = {};
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody });

  try {
    const response = await axios.post(
      `${getProductionUrl()}/data-retrieval/request/${requestId}/export/${outputFormat}`,
      requestBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/request/${requestId}/export/${outputFormat}`,
        method: 'POST',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to export report: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get export status
 */
export async function getExportStatus({
  exportId,
  partnerType,
  ...authParams
}) {
  if (!exportId) {
    throw new Error('exportId is required (UUID from export request)');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/export/${exportId}/status`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/export/${exportId}/status`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get export status: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Download exported report
 */
export async function downloadExport({
  exportId,
  partnerType,
  ...authParams
}) {
  if (!exportId) {
    throw new Error('exportId is required (UUID from export request)');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/export/${exportId}/download`,
      {
        headers,
        responseType: 'arraybuffer' // For binary data (PDF, Excel, etc.)
      }
    );

    return {
      success: true,
      data: response.data,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/export/${exportId}/download`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to download export: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Cancel report generation
 */
export async function cancelReport({
  requestId,
  partnerType,
  ...authParams
}) {
  if (!requestId) {
    throw new Error('requestId is required (UUID from report generation)');
  }

  const requestBody = {};
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody });

  try {
    const response = await axios.put(
      `${getProductionUrl()}/data-retrieval/${requestId}/cancel`,
      requestBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/${requestId}/cancel`,
        method: 'PUT',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to cancel report: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Cancel export
 */
export async function cancelExport({
  exportId,
  partnerType,
  ...authParams
}) {
  if (!exportId) {
    throw new Error('exportId is required (UUID from export request)');
  }

  const requestBody = {};
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody });

  try {
    const response = await axios.put(
      `${getProductionUrl()}/data-retrieval/${exportId}/cancel`,
      requestBody,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/${exportId}/cancel`,
        method: 'PUT',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to cancel export: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * List all available reports
 */
export async function listReports({
  partnerType,
  ...authParams
}) {
  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/reports`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/reports`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to list reports: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get report request history for a specific report type
 */
export async function getReportRequests({
  reportId,
  partnerType,
  ...authParams
}) {
  if (!reportId) {
    throw new Error('reportId is required (e.g., "/processedTransactions")');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval${reportId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval${reportId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get report requests: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get export list for a specific request
 */
export async function getExportList({
  requestId,
  partnerType,
  ...authParams
}) {
  if (!requestId) {
    throw new Error('requestId is required (UUID from report generation)');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/exports/${requestId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/exports/${requestId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw new Error(`Failed to get export list: ${error.response?.data?.message || error.message}`);
  }
}