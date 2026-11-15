import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../api-errors.js';

/**
 * The report ids in the server's registry. The list endpoint returns each as a `path`
 * ('/monthlyStatement'); a run takes the bare id, which DataRetrievalRequest checks against
 * ^[A-Za-z0-9_-]{1,64}$. These were sent with the slash, so every run answered 400.
 */
export const REPORT_TYPES = {
  // The catalogue of 2026-11 (kb tech/details/data-api.md, "Data sets and reports"). Which of these a caller
  // may run is what payware_data_list_reports returns: it depends on partner type and plan. The YTD, MTD, WTD
  // and per-product transaction lists are gone; the transactions report takes a period preset instead.
  PROCESSED_TRANSACTIONS: 'processedTransactions',
  // Statements
  FEE_STATEMENT: 'settlementFeeStatement',
  MONTHLY_STATEMENT: 'monthlyStatement',
  BANK_RECONCILIATION: 'bankReconciliation',
  FEE_INVOICE_REGISTER: 'feeInvoiceRegister',
  DISPUTES_AND_ADJUSTMENTS: 'disputesAndAdjustments',
  REVENUE_SHARE_STATEMENT: 'partnerShareStatement',
  PARTNER_MONTHLY_REPORT: 'partnerMonthlyReport',
  SUB_COMMISSION_STATEMENT: 'subCommissionStatement',
  DAILY_RECONCILIATION: 'dailyReconciliation',
  QUARTERLY_REVIEW: 'institutionQuarterlyReview',
  SHARE_ACCRUAL: 'institutionShareAccrual',
  INSTITUTION_STATEMENT: 'institutionStatement',
  // Reports
  SALES_PER_PRODUCT: 'salesPerProduct',
  TRANSACTIONS_PER_WEBPOS: 'transactionsPerWebPOS',
  GROWTH_PROGRAM: 'growthProgram',
  MERCHANT_PORTFOLIO: 'isvPortfolio',
  VOLUME_BY_MERCHANT: 'mediatedVolume',
  TERMINAL_FLEET: 'producerFleet',
  EXCEPTIONS: 'institutionExceptions',
  // Analytics
  SALES_ANALYTICS: 'salesAnalytics',
  PAYMENT_ACCEPTANCE: 'paymentAcceptance',
  CAMPAIGN_RESULTS: 'campaignResults',
  // Profile and exports
  PARTNER_PROFILE: 'partnerProfile',
  PAYMENT_PROFILES: 'paymentProfiles',
  PRODUCTS_LIST: 'productsList',
  SCHEDULES_LIST: 'schedulesList',
  SHOPS_LIST: 'shopsList'
};

/**
 * Period presets (server ReportPeriods). Which ones a report takes depends on its `period` in the list:
 * RANGE takes all, DAY TODAY/YESTERDAY, MONTH THIS_MONTH/LAST_MONTH, QUARTER THIS_QUARTER/LAST_QUARTER, each with
 * CUSTOM. Every preset is open on every plan; a custom range needs Standard or above.
 */
export const REPORT_PERIODS = ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH',
  'THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'CUSTOM'];

/** The period input every report tool takes. */
export const PERIOD_PROPERTY = {
  type: "string",
  description: "Period preset: TODAY, YESTERDAY, THIS_WEEK, LAST_WEEK, THIS_MONTH, LAST_MONTH, THIS_QUARTER, LAST_QUARTER, THIS_YEAR, LAST_YEAR, or CUSTOM with dateFrom (and dateTo for a range). Which presets a report takes is its `period` in payware_data_list_reports. Omitted with dates is CUSTOM; omitted without dates is today, or the last closed month or quarter for a statement. Every preset is open on every plan; a custom range needs Standard or above (ERR_REPORT_CUSTOM_RANGE_NOT_IN_PLAN).",
  enum: REPORT_PERIODS
};

/**
 * A report id as the server takes it: the last segment of a path such as the list endpoint returns
 * ('/monthlyStatement' or '/reports/x' -> 'monthlyStatement', 'x'), as the portal does.
 */
export function reportUnitIdOf(value) {
  return String(value ?? '').split('/').filter(Boolean).pop() ?? '';
}

/**
 * The export formats, exactly the server's ReportOutputFormat. Anything else is not refused: the
 * server silently falls back to the report's default format (ReportBaseController.validateOutputFormat),
 * so an offered 'json' produced a PDF.
 */
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  XLS: 'xls',
  XLSX: 'xlsx',
  RTF: 'rtf',
  CSV: 'csv',
  HTML: 'html',
  XML: 'xml',
  DOCX: 'docx',
  ODT: 'odt',
  ODS: 'ods'
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
      // An ISV calling for itself (its own reports): signed like any partner, aud https://payware.eu.
      // With a merchant's partner id and OAuth2 token it is acting for that merchant instead, and runs
      // the merchant's reports (server DataRetrievalService, 2026-11-11).
      if (!authParams.merchantPartnerId && !authParams.oauth2Token) {
        tokenData = createJWTToken(authParams.isvPartnerId, authParams.privateKey, authParams.requestBody);
        break;
      }
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
  period,
  timeZone = 'GMT',
  partnerType,
  ...authParams
}) {
  const unitId = reportUnitIdOf(reportUnitId);
  if (!unitId) {
    throw new Error('reportUnitId is required (e.g., "processedTransactions")');
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(unitId)) {
    throw new Error(`Invalid reportUnitId "${reportUnitId}": a report id is 1-64 letters, digits, _ or -`);
  }

  if (!Object.values(LOCALES).includes(locale)) {
    throw new Error(`Invalid locale. Supported: ${Object.values(LOCALES).join(', ')}`);
  }

  const requestBody = {
    reportUnitId: unitId,
    ignorePagination,
    locale,
    timeZone
  };

  if (period) {
    if (!REPORT_PERIODS.includes(period)) {
      throw new Error(`Invalid period "${period}". Supported: ${REPORT_PERIODS.join(', ')}`);
    }
    requestBody.period = period;
  }
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
    throw describeApiError(error, 'generate report');
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
    throw describeApiError(error, 'get report status');
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
    throw describeApiError(error, 'export report');
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
    throw describeApiError(error, 'get export status');
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
      contentDisposition: response.headers['content-disposition'],
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/export/${exportId}/download`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw describeApiError(error, 'download export');
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
    throw describeApiError(error, 'cancel report');
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
    throw describeApiError(error, 'cancel export');
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
    throw describeApiError(error, 'list reports');
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
  const unitId = reportUnitIdOf(reportId);
  if (!unitId) {
    throw new Error('reportId is required (e.g., "processedTransactions")');
  }

  const headers = await createAuthHeaders(partnerType, authParams);

  try {
    const response = await axios.get(
      `${getProductionUrl()}/data-retrieval/${unitId}`,
      { headers }
    );

    return {
      success: true,
      data: response.data,
      requestInfo: {
        url: `${getProductionUrl()}/data-retrieval/${unitId}`,
        method: 'GET',
        statusCode: response.status
      }
    };
  } catch (error) {
    throw describeApiError(error, 'get report requests');
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
    throw describeApiError(error, 'get export list');
  }
}