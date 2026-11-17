import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';

import { FakePaywareServer } from './fake-payware.js';
import { generateTestKeyPair } from './keys.js';

/**
 * A model of payware for the fake server: the hosts, routes, authentication and validation rules of
 * server/, so a tool that sends what payware refuses is refused here too.
 *
 * The fake server used to answer whatever a test queued, at any path, signed with any key. The tests
 * then mirrored the implementation where the bugs lived: no /api prefix, one key for both
 * environments, no validation, response shapes the server never sends (shopCode, reportUnitId, a
 * made-up legal form). Every rule below is the server's, with the class it comes from:
 *
 * - Hosts: an API host (sandbox or production) and a soundbite host per environment. Recognition is
 *   answered only on the soundbite host; the API hosts refuse a multipart POST /api/transactions with
 *   421 ERR_SOUNDBITE_HOST (TransactionController.SOUNDBITE_DESCRIPTION, kb financial-institution/api).
 * - Routes: the controllers' request mappings; anything else is 404, a known path with another verb 405.
 * - Authentication (OncePerRequestPaywareAuthorizationFilter, AuthError, RestAuthenticationEntryPoint):
 *   an RS256 JWT signed with THIS environment's key, typ JWT, a known iss, iat within five minutes,
 *   aud https://payware.eu (no sub) or, for an ISV acting for a merchant, aud the merchant and sub a
 *   GRANTED OAuth2 token of that ISV for that merchant; /oauth2 only for an ISV itself. A POST, PUT or
 *   PATCH with a non-multipart body must carry contentSha256 over the exact bytes. Api-Version 1 on
 *   /api (400 ERR_UNSUPPORTED_API_VERSION), not on /oauth2. Auth failures are 401.
 * - Validation: the rules the tools' fields meet on the server (MerchantValidationService,
 *   FIValidationService, QrOptionsValidationService, BarcodeOptionsValidationService,
 *   DataRetrievalRequest, POIPriceRequest, Oauth2Controller), with the server's error codes.
 * - State: the finalize execution lock (server docs/execution-lock.md) per transaction, and the report
 *   requests run against it, each found only in the context it was run in (server V112).
 * - Answers: bodies shaped as the server's DTOs (ShopDTO, ReportDTO, TransactionDTO, ProductDTO,
 *   ScheduleDTO, the reference DTOs, Oauth2Token), and X-Correlation-ID on every response.
 *
 * A test that queues a response still goes through routing, authentication and validation first; the
 * queued answer then replaces the model's own, and the model's state does not move.
 */

export const IDS = {
  TX: 'pw12345678',
  // A merchant's open payment of 22.00 with its own 2.00 tip inside (spec 24.1, D2), in a shop that allows tips.
  TIPPED: 'pwTipped01',
  PRODUCT: 'pr12345678',
  SCHEDULE: 11,
  AUDIO: 7,
  POI: 'piABC12345',
  REQUEST: '1a81220c-2e38-4759-b067-c81abf176295',
  EXPORT: '2a81220c-2e38-4759-b067-c81abf176296',
  INVITATION: 42,
  OAUTH2_TOKEN: 'test-oauth2-token',
  CAMPAIGN: 'cp12345678',
  PLACEMENT: 'pl12345678',
  RULE: 17,
  RECOGNITION: 'rc12345678'
};

/**
 * Partners by partner id, as the server resolves the JWT's iss. maxTransactionTtl is a merchant's ceiling on the
 * timeToLive it may create a payment with (MerchantValidationService.maxTransactionTtl, spec 24.3): 600 when unset,
 * raised by the merchant in the portal profile up to 2,592,000. PZAYNMVE has raised it to 30 days, so an ISV acting for
 * it gets that ceiling, while TESTMRCH keeps the default.
 */
export const PARTNERS = {
  TESTMRCH: { type: 'merchant', plan: 'PRM' },
  PZAYNMVE: { type: 'merchant', plan: 'PRM', maxTransactionTtl: 2592000 },
  TESTISV1: { type: 'isv' },
  TESTBANK: { type: 'payment_institution' }
};

/** OAuth2 tokens: value -> the ISV that holds it and the merchant it is for. */
export const OAUTH2_TOKENS = {
  [IDS.OAUTH2_TOKEN]: { isv: 'TESTISV1', merchant: 'PZAYNMVE', status: 'GRANTED' }
};

/** The client credentials one merchant gave the ISV (Oauth2Controller.requestToken). */
export const OAUTH2_CLIENTS = { TESTMRCH: 'dGVzdC1zZWNyZXQ=' };

/** The currency table: code -> payable scale (TransactionFeeService.payableScale). */
const CURRENCIES = { EUR: 2, BGN: 2, USD: 2, GBP: 2, RON: 2, CHF: 2, CZK: 2, PLN: 2, HUF: 2, SEK: 2, DKK: 2, NOK: 2, JPY: 0, BHD: 3 };

const IMAGE_FORMATS = ['PNG', 'JPG', 'SVG'];
const TRANSFER_TYPES = ['INSTANT', 'INTERNAL', 'DEFERRED'];

// ---------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------

const SEG = '([^/]+)';
const UNIT = '([A-Za-z0-9_-]{1,64})';

/**
 * [method, path pattern, route name, audience]. Audience: 'merchant' (a merchant, or an ISV on its
 * behalf), 'isv' (an ISV for itself), 'merchant_fi' (a merchant, an ISV on its behalf, or an
 * institution), 'reports' (any of those and an ISV for itself: ReportApiController asks only for STD
 * or PRM, and an ISV is PRM), 'logs' (a merchant or an institution, LogAccessController), 'fi' (an
 * institution), 'any'. Order matters where patterns overlap.
 */
const API_ROUTES = [
  ['POST', '/api/transactions', 'createTransaction', 'merchant_fi'],
  ['GET', `/api/transactions/${SEG}`, 'getTransaction', 'merchant_fi'],
  ['POST', `/api/transactions/${SEG}`, 'processTransaction', 'merchant_fi'],
  ['PATCH', `/api/transactions/${SEG}`, 'finalizeTransaction', 'merchant_fi'],
  ['GET', `/api/transactions-history/${SEG}`, 'getTransactionHistory', 'merchant_fi'],
  // Institutions only (ApiTier.FI): re-prices pr, pl, ps and pa with no side effects.
  ['GET', `/api/transactions/${SEG}/quote`, 'quote', 'fi'],

  ['GET', '/api/products', 'listProducts', 'merchant'],
  ['POST', '/api/products', 'createProduct', 'merchant'],
  ['GET', `/api/products/${SEG}`, 'getProduct', 'merchant'],
  ['PATCH', `/api/products/${SEG}`, 'updateProduct', 'merchant'],
  ['DELETE', `/api/products/${SEG}`, 'deleteProduct', 'merchant'],
  ['POST', `/api/products/${SEG}/image`, 'productImage', 'merchant'],
  ['GET', `/api/products/${SEG}/delivery`, 'getProductDelivery', 'merchant'],
  ['PUT', `/api/products/${SEG}/delivery`, 'setProductDelivery', 'merchant'],
  ['GET', `/api/products/${SEG}/schedules`, 'listSchedules', 'merchant'],
  ['POST', `/api/products/${SEG}/schedules`, 'createSchedule', 'merchant'],
  ['GET', `/api/products/${SEG}/schedules/${SEG}`, 'getSchedule', 'merchant'],
  ['PATCH', `/api/products/${SEG}/schedules/${SEG}`, 'updateSchedule', 'merchant'],
  ['DELETE', `/api/products/${SEG}/schedules/${SEG}`, 'deleteSchedule', 'merchant'],
  ['GET', `/api/products/${SEG}/audios`, 'listAudios', 'merchant'],
  ['POST', `/api/products/${SEG}/audios/upload`, 'uploadAudio', 'merchant'],
  ['POST', `/api/products/${SEG}/audios/${SEG}/transfer`, 'transferAudio', 'merchant'],
  ['GET', `/api/products/${SEG}/audios/${SEG}`, 'getAudio', 'merchant'],
  ['PATCH', `/api/products/${SEG}/audios/${SEG}`, 'updateAudio', 'merchant'],
  ['DELETE', `/api/products/${SEG}/audios/${SEG}`, 'deleteAudio', 'merchant'],

  ['GET', `/api/products/${SEG}/placements`, 'listPlacements', 'merchant'],
  ['POST', `/api/products/${SEG}/placements`, 'createPlacement', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}/image`, 'placementImage', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}/stats`, 'placementStats', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}/airings/next`, 'nextAirings', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}/airings`, 'listAirings', 'merchant'],
  ['POST', `/api/products/${SEG}/placements/${SEG}/airings`, 'createAiring', 'merchant'],
  ['PUT', `/api/products/${SEG}/placements/${SEG}/airings`, 'replaceAirings', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}/airings/${SEG}`, 'getAiring', 'merchant'],
  ['PUT', `/api/products/${SEG}/placements/${SEG}/airings/${SEG}`, 'updateAiring', 'merchant'],
  ['DELETE', `/api/products/${SEG}/placements/${SEG}/airings/${SEG}`, 'deleteAiring', 'merchant'],
  ['GET', `/api/products/${SEG}/placements/${SEG}`, 'getPlacement', 'merchant'],
  ['PUT', `/api/products/${SEG}/placements/${SEG}`, 'updatePlacement', 'merchant'],
  ['DELETE', `/api/products/${SEG}/placements/${SEG}`, 'deletePlacement', 'merchant'],
  ['GET', '/api/placements/calendar', 'airingCalendar', 'merchant'],

  ['GET', '/api/campaigns', 'listCampaigns', 'merchant'],
  ['POST', '/api/campaigns', 'createCampaign', 'merchant'],
  ['GET', `/api/campaigns/${SEG}/stats`, 'campaignStats', 'merchant'],
  ['GET', `/api/campaigns/${SEG}`, 'getCampaign', 'merchant'],
  ['PUT', `/api/campaigns/${SEG}`, 'updateCampaign', 'merchant'],
  ['DELETE', `/api/campaigns/${SEG}`, 'deleteCampaign', 'merchant'],

  ['GET', '/api/data-retrieval/reports', 'listReports', 'reports'],
  ['POST', '/api/data-retrieval', 'runReport', 'reports'],
  ['GET', `/api/data-retrieval/exports/${SEG}`, 'listExports', 'reports'],
  ['GET', `/api/data-retrieval/request/${SEG}/status`, 'reportStatus', 'reports'],
  ['POST', `/api/data-retrieval/request/${SEG}/export/${SEG}`, 'exportReport', 'reports'],
  ['GET', `/api/data-retrieval/export/${SEG}/status`, 'exportStatus', 'reports'],
  ['GET', `/api/data-retrieval/export/${SEG}/download`, 'downloadExport', 'reports'],
  ['PUT', `/api/data-retrieval/${SEG}/cancel`, 'cancelReport', 'reports'],
  ['GET', `/api/data-retrieval/${UNIT}`, 'listReportRequests', 'reports'],

  ['GET', '/api/logs', 'queryLogs', 'logs'],
  ['GET', '/api/logs/status', 'logStatus', 'logs'],
  ['GET', '/api/logs/stream', 'streamLogs', 'logs'],
  ['GET', '/api/logs/download', 'downloadLogs', 'logs'],

  ['GET', '/api/shops', 'listShops', 'merchant'],
  // Delivery settings (spec 22.7): one controller, ApiTier.MERCHANT, an ISV on behalf within its shop scope.
  ['GET', `/api/shops/${SEG}/delivery`, 'getShopDelivery', 'merchant'],
  ['PUT', `/api/shops/${SEG}/delivery`, 'setShopDelivery', 'merchant'],

  ['GET', '/api/poi', 'listPois', 'merchant'],
  ['POST', '/api/poi', 'createPoi', 'merchant'],
  ['POST', '/api/poi/batch', 'createPoiBatch', 'merchant'],
  ['GET', `/api/poi/${SEG}/status`, 'poiStatus', 'merchant'],
  ['PUT', `/api/poi/${SEG}/price`, 'setPoiPrice', 'merchant'],
  ['DELETE', `/api/poi/${SEG}/price`, 'cancelPoiPrice', 'merchant'],
  ['GET', `/api/poi/${SEG}/image`, 'poiImage', 'merchant'],
  ['GET', `/api/poi/${SEG}`, 'getPoi', 'merchant'],

  ['POST', '/api/isv/invitations', 'createInvitation', 'isv'],
  ['GET', '/api/isv/invitations', 'listInvitations', 'isv'],
  ['GET', `/api/isv/invitations/${SEG}`, 'getInvitation', 'isv'],
  ['DELETE', `/api/isv/invitations/${SEG}`, 'cancelInvitation', 'isv'],
  ['GET', '/api/isv/reference/(legal-forms|business-activities|currencies|languages|jurisdictions)', 'reference', 'isv'],

  ['POST', '/oauth2/tokens', 'requestToken', 'isv'],
  ['GET', '/oauth2/tokens', 'listTokens', 'isv'],
  ['POST', `/oauth2/tokens/${SEG}/rotate`, 'rotateToken', 'isv'],
  ['GET', `/oauth2/tokens/${SEG}`, 'getToken', 'isv']
];

const SOUNDBITE_ROUTES = [
  ['POST', '/api/transactions', 'recognise', 'fi'],
  ['POST', `/api/transactions/recognitions/${SEG}`, 'recognitionFeedback', 'fi']
];

const compile = routes => routes.map(([method, pattern, name, audience]) => ({ method, re: new RegExp(`^${pattern}$`), name, audience }));
const COMPILED = { api: compile(API_ROUTES), soundbite: compile(SOUNDBITE_ROUTES) };

// ---------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------

const err = (status, errorCode, message = errorCode) => ({
  status,
  body: { errorCode, message, correlationId: 'test-correlation-id' }
});

const present = v => v !== undefined && v !== null && v !== '';

/** Whether a "yyyy-MM-dd[ HH:mm:ss]" start date is before today (UTC here; the server reads it in the product's zone). */
const startsBeforeToday = value => present(value) && String(value).slice(0, 10) < new Date().toISOString().slice(0, 10);

/** The refusals of the deliveryCountry and quantity query parameters on an offer read or a quote. */
function offerQueryRefusal(query) {
  if (present(query.deliveryCountry) && !/^[A-Za-z]{2}$/.test(query.deliveryCountry)) return err(400, 'ERR_INVALID_DELIVERY_COUNTRY');
  if (present(query.quantity) && !/^([1-9]|[1-9][0-9])$/.test(query.quantity)) return err(400, 'ERR_INVALID_QUANTITY');
  return null;
}

/**
 * Merchant `items` (spec 22.6): 1-50 lines, ITEM with quantity 1-99 and amount = quantity x unitPrice,
 * DISCOUNT below zero and everything else not, summing exactly to trData.amount; a bank-created payment
 * with items is refused (ERR_INVALID_ITEMS), as is an amount of 0.00. No TIP (spec 24.1,
 * TransactionItemsValidationService.TYPES): a tip is never a line, so a TIP line is refused like any unknown type.
 * With the merchant's own tip the lines add up to the amount before it, which the caller passes as `amount`.
 */
function itemsRefusal(items, amount, currency, bank) {
  const TYPES = ['ITEM', 'SHIPPING', 'DISCOUNT', 'TAX', 'SURCHARGE'];
  // An empty list has its own code (VG 2026-11-15): leave items out instead.
  if (!bank && Array.isArray(items) && items.length === 0) return err(400, 'ERR_ITEMS_EMPTY');
  if (bank || !Array.isArray(items) || items.length > 50 || !(Number(amount) > 0)) return err(400, 'ERR_INVALID_ITEMS');
  let sum = 0;
  for (const line of items) {
    if (!TYPES.includes(line?.type) || !present(line.name) || String(line.name).length > 100) return err(400, 'ERR_INVALID_ITEMS');
    // payware sets country only on the delivery lines it prices; a merchant line with one is refused.
    if (present(line.country)) return err(400, 'ERR_INVALID_ITEMS');
    if (amountOf(line.amount, currency, { allowNegative: true }) === null) return err(400, 'ERR_INVALID_ITEMS');
    const value = Number(line.amount);
    if (line.type === 'DISCOUNT' ? !(value < 0) : value < 0) return err(400, 'ERR_INVALID_ITEMS');
    if (line.type === 'ITEM') {
      if (!(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99)) return err(400, 'ERR_INVALID_ITEMS');
      if (Math.abs(line.quantity * Number(line.unitPrice) - value) > 1e-9) return err(400, 'ERR_INVALID_ITEMS');
    }
    sum += value;
  }
  return Math.abs(sum - Number(amount)) < 1e-9 ? null : err(400, 'ERR_ITEMS_DO_NOT_SUM');
}

/**
 * The server's caps on an amount a caller sends: at most 15 significant digits (trailing zeros of the fraction are not
 * significant) and at most 15 integer digits (TransactionFeeService.MAX_AMOUNT_SIGNIFICANT_DIGITS and decision 10).
 */
function exceedsAmountDigits(value) {
  const s = String(value).replace(/^-/, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  const [whole, fraction = ''] = s.split('.');
  const integer = whole.replace(/^0+/, '');
  const digits = (integer + fraction.replace(/0+$/, '')).replace(/^0+/, '').replace(/0+$/, '');
  return integer.length > 15 || digits.length > 15;
}

/** A decimal amount string the server accepts for this currency, or null. */
function amountOf(value, currency, { positive = false, allowNegative = false } = {}) {
  if (!present(value)) return null;
  const s = String(value);
  if (!(allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(s) || s.replace(/[^0-9]/g, '').length > 36) return null;
  const significant = (s.split('.')[1] || '').replace(/0+$/, '').length;
  if (significant > (CURRENCIES[String(currency).toUpperCase()] ?? 2)) return null;
  const n = Number(s);
  if (positive ? n <= 0 : (n < 0 && !allowNegative)) return null;
  return n;
}

const knownCurrency = c => present(c) && String(c).toUpperCase() in CURRENCIES;

const inRange = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

function qrRefusal(options) {
  if (!options) return null;
  if (present(options.qrFormat) && !IMAGE_FORMATS.includes(options.qrFormat)) return err(400, 'ERR_INVALID_IMAGE_FORMAT');
  if (present(options.qrBorder) && !inRange(options.qrBorder, 1, 10)) return err(400, 'ERR_INVALID_QR_BORDER');
  if (present(options.qrErrorCorrection) && !['LOW', 'MEDIUM', 'QUARTILE', 'HIGH'].includes(options.qrErrorCorrection)) return err(400, 'ERR_INVALID_QR_ERROR_CORRECTION');
  if (present(options.qrScale) && !inRange(options.qrScale, 1, 100)) return err(400, 'ERR_INVALID_QR_SCALE');
  if (present(options.qrVersion) && !inRange(options.qrVersion, 1, 40)) return err(400, 'ERR_INVALID_QR_VERSION');
  return null;
}

function barRefusal(options) {
  if (!options) return null;
  if (present(options.barFormat) && !IMAGE_FORMATS.includes(options.barFormat)) return err(400, 'ERR_INVALID_IMAGE_FORMAT');
  if (present(options.barModuleWidth) && !inRange(options.barModuleWidth, 1, 10)) return err(400, 'ERR_INVALID_BARCODE_MODULE_WIDTH');
  if (present(options.barBarHeight) && !inRange(options.barBarHeight, 15, 1000)) return err(400, 'ERR_INVALID_BARCODE_BAR_HEIGHT');
  if (present(options.barFontSize) && !inRange(options.barFontSize, 0, 24)) return err(400, 'ERR_INVALID_BARCODE_FONT_SIZE');
  if (present(options.barHumanReadableLocation) && !['NONE', 'BOTTOM', 'TOP'].includes(options.barHumanReadableLocation)) return err(400, 'ERR_INVALID_BARCODE_HUMAN_READABLE_LOCATION');
  return null;
}

/** A TransactionDTO, as GET /api/transactions/{id} returns it. */
export function transactionDto(id, overrides = {}) {
  return {
    transactionId: id,
    transactionType: 'DEFAULT',
    initiatedBy: 'MERCHANT',
    payeeFriendlyName: 'Test Shop',
    payeeBIC: 'SBBICID1',
    payeeAccount: 'BG80BNBG96611020345678',
    currency: 'EUR',
    amount: '10.00',
    reasonL1: 'Test',
    created: Date.UTC(2026, 10, 10, 9, 0, 0),
    timeToLive: 120,
    status: 'ACTIVE',
    ...overrides
  };
}

/**
 * The shops' active shippable products, for the shop delivery PUT's undeliverableProducts (server DeliverySettingsService,
 * VG 2026-11-15): those whose currency has no row in a non-empty saved table.
 */
const SHIPPABLE_PRODUCTS = [{ shopCode: 'SHOP01', productId: 'prVase0001', name: 'Vase', currency: 'EUR' }];

const PRODUCT_DTO = {
  productId: IDS.PRODUCT,
  type: 'ITEM',
  shopCode: 'SHOP01',
  shopName: 'Main store',
  name: 'Coffee',
  shortDescription: 'A cup of coffee',
  currencyCode: 'EUR',
  regularPrice: '2.50',
  overlapPriority: 'LOWEST',
  timeToLive: 120,
  shippable: false,
  quickPay: false,
  active: true,
  timeZone: 'Europe/Sofia'
};

const SCHEDULE_DTO = {
  id: IDS.SCHEDULE,
  productId: IDS.PRODUCT,
  description: 'Happy hour',
  regularPrice: '2.50',
  salePrice: '2.00',
  priceCorrection: 'DISCOUNT',
  correctionType: 'PERCENTAGE',
  correctionValue: 20,
  dateFrom: Date.UTC(2026, 10, 10, 15, 0, 0),
  dateTo: Date.UTC(2026, 10, 10, 17, 0, 0)
};

const REFERENCE = {
  'legal-forms': [{ id: 3, code: 'OOD', acronym: 'ООД', extensiveTitle: 'Дружество с ограничена отговорност' }],
  'business-activities': [{ id: 12, section: 'G', activityDescription: 'Retail trade' }],
  currencies: [{ id: 1, code: 'EUR' }, { id: 2, code: 'BGN' }],
  languages: [{ id: 1, code: 'en', nativeName: 'English' }],
  jurisdictions: [{ id: 1, officialName: 'Bulgaria', code: 'BG', phoneCode: '359', languageId: 2 }]
};

const oauth2TokenDto = (accessToken, clientId, status = 'GRANTED') => ({
  clientId, accessToken, tokenType: 'Bearer', expiresIn: 15552000, scope: 'merchant', status
});

// ---------------------------------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------------------------------

export class PaywareModel {
  /**
   * @param {Object} options
   * @param {'api'|'soundbite'} options.host
   * @param {'sandbox'|'production'} options.environment
   * @param {string} options.publicKey this environment's public key
   */
  constructor({ host, environment, publicKey }) {
    this.host = host;
    this.environment = environment;
    this.publicKey = publicKey;
    this.reset();
  }

  /**
   * Back to the seeded state: one processed, ACTIVE transaction (IDS.TX), one open one carrying the merchant's own
   * tip (IDS.TIPPED), and no report requests but the
   * seeded IDS.REQUEST and IDS.EXPORT, which answer every caller.
   */
  reset() {
    this.transactions = new Map([
      [IDS.TX, { status: 'ACTIVE', processed: true, amount: '10.00', currency: 'EUR', tipsAllowed: false }],
      [IDS.TIPPED, { status: 'ACTIVE', processed: false, amount: '22.00', tip: '2.00', currency: 'EUR', tipsAllowed: true }]
    ]);
    /** Report requests run against the model: requestId -> { partner, onBehalf, reportUnitId }. */
    this.reportRequests = new Map();
    /** Exports of those requests: exportId -> requestId. */
    this.reportExports = new Map();
    this.reportSeq = 0;
  }

  /**
   * The context a report request is run and found in (server V112, DataRetrievalService 2026-11-11): the
   * acting partner owns it, and an ISV's request run with a merchant's token is marked with that merchant.
   * An ISV sees only the kind it is asking as; the merchant sees none of them, as they carry the ISV's id.
   */
  static reportContext(caller) {
    return { partner: caller.isv ?? caller.partnerId, onBehalf: caller.isv ? caller.partnerId : null };
  }

  /** Whether a request the model ran is outside the caller's context; a seeded id is in every context. */
  #reportHidden(requestId, caller) {
    const row = this.reportRequests.get(requestId);
    if (!row) return false;
    const mine = PaywareModel.reportContext(caller);
    return row.partner !== mine.partner || row.onBehalf !== mine.onBehalf;
  }

  #nextReportId(prefix) {
    this.reportSeq += 1;
    return `${prefix}${String(this.reportSeq).padStart(12, '0')}`;
  }

  route(req) {
    const routes = COMPILED[this.host];
    let pathKnown = false;
    for (const r of routes) {
      const m = r.re.exec(req.path);
      if (!m) continue;
      pathKnown = true;
      if (r.method === req.method) return { ...r, params: m.slice(1) };
    }
    return { refusal: pathKnown ? err(405, 'ERR_METHOD_NOT_SUPPORTED') : err(404, 'ERR_RESOURCE_NOT_FOUND') };
  }

  /** The refusal for this request, or null when payware would serve it. Sets req.route and req.caller. */
  refuse(req) {
    const isMultipart = String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data');

    if (this.host === 'api' && req.method === 'POST' && req.path === '/api/transactions' && isMultipart) {
      return err(421, 'ERR_SOUNDBITE_HOST', 'Soundbite recognition is answered only at the soundbite host.');
    }
    const route = this.route(req);
    if (route.refusal) return route.refusal;
    req.route = route.name;

    const auth = this.#authenticate(req, route, isMultipart);
    if (auth.refusal) return auth.refusal;
    req.caller = auth.caller;

    return this.#validate(req, route, isMultipart);
  }

  #authenticate(req, route, isMultipart) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return { refusal: err(401, 'ERR_MISSING_AUTH_HEADER') };
    let decoded;
    try {
      decoded = jwt.verify(header.slice(7), this.publicKey, { algorithms: ['RS256'], complete: true, clockTolerance: 5 });
    } catch {
      // Another environment's key, a tampered token, or no token at all.
      return { refusal: err(401, 'ERR_INVALID_SIGNATURE') };
    }
    const { header: h, payload: p } = decoded;
    if (h.typ !== 'JWT') return { refusal: err(401, 'ERR_INVALID_JWT_TYPE') };
    if (!p.iss) return { refusal: err(401, 'ERR_MISSING_ISSUER') };
    if (!p.iat) return { refusal: err(401, 'ERR_MISSING_ISSUED_AT') };
    if (Math.abs(Date.now() / 1000 - p.iat) > 300) return { refusal: err(401, 'ERR_STALE_TOKEN') };
    const partner = PARTNERS[p.iss];
    if (!partner) return { refusal: err(401, 'ERR_INVALID_PARTNER_ID') };
    if (!p.aud) return { refusal: err(401, 'ERR_MISSING_AUD') };

    const oauth2 = req.path.startsWith('/oauth2/');
    let caller;
    if (oauth2) {
      if (p.aud !== 'https://payware.eu' || p.sub !== undefined) return { refusal: err(401, 'ERR_INVALID_AUDIENCE_FOR_OAUTH_REQUEST') };
      caller = { partnerId: p.iss, type: partner.type };
    } else if (p.aud === 'https://payware.eu') {
      if (p.sub !== undefined) return { refusal: err(401, 'ERR_INVALID_AUD') };
      caller = { partnerId: p.iss, type: partner.type };
    } else {
      // On behalf: an ISV, a merchant as aud and that ISV's GRANTED token for it as sub.
      const grant = OAUTH2_TOKENS[p.sub];
      if (partner.type !== 'isv' || !PARTNERS[p.aud]) return { refusal: err(401, 'ERR_INVALID_AUD') };
      if (!p.sub) return { refusal: err(401, 'ERR_MISSING_TOKEN') };
      if (!grant || grant.isv !== p.iss || grant.merchant !== p.aud || grant.status !== 'GRANTED') return { refusal: err(401, 'ERR_INVALID_TOKEN') };
      caller = { partnerId: p.aud, type: 'merchant', isv: p.iss };
    }

    // Api-Version on /api; /oauth2 does not ask for one.
    if (!oauth2 && req.headers['api-version'] !== '1') return { refusal: err(400, 'ERR_UNSUPPORTED_API_VERSION') };

    // contentSha256 over the exact bytes of a non-multipart POST, PUT or PATCH body.
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.rawBody.length > 0 && !isMultipart) {
      if (!h.contentSha256) return { refusal: err(401, 'ERR_MISSING_CONTENT_HASH') };
      if (req.contentHashMatches !== true) return { refusal: err(401, 'ERR_INVALID_CONTENT_HASH') };
    }

    const allowed = {
      merchant: caller.type === 'merchant',
      isv: caller.type === 'isv',
      fi: caller.type === 'payment_institution',
      merchant_fi: caller.type === 'merchant' || caller.type === 'payment_institution',
      reports: true,
      logs: (caller.type === 'merchant' && !caller.isv) || caller.type === 'payment_institution',
      any: true
    }[route.audience];
    if (!allowed) return { refusal: err(403, 'ERR_UNAUTHORIZED_OPERATION') };
    return { caller };
  }

  #validate(req, route, isMultipart) {
    const body = req.json ?? {};
    const caller = req.caller;
    const bank = caller.type === 'payment_institution';

    switch (route.name) {
      case 'createTransaction': {
        const tr = body.trData;
        if (bank && !['SRC', 'DST'].includes(body.role)) return err(400, 'ERR_UNKNOWN_ROLE');
        if (!tr || !knownCurrency(tr.currency)) return err(400, 'ERR_UNKNOWN_CURRENCY');
        if (present(tr.amount) && exceedsAmountDigits(tr.amount)) return err(400, 'ERR_INVALID_AMOUNT_LENGTH');
        if (amountOf(tr.amount, tr.currency) === null) return err(400, 'ERR_INVALID_AMOUNT');
        if (!bank && !present(tr.reasonL1)) return err(400, 'ERR_MISSING_REASON');
        // The merchant's own tip (spec 24.1, D2; TransactionService.generateTransaction, TipService.merchantTipOf):
        // inside amount, a plain decimal above zero at the currency's scale and at most the amount before it. An
        // institution creates no merchant payment: its tip is 409.
        let beforeTip = tr.amount;
        if (present(tr.tip)) {
          if (bank) return err(409, 'ERR_TIPS_NOT_ALLOWED');
          const tip = String(tr.tip).trim();
          if (!/^\d{1,12}(\.\d{1,8})?$/.test(tip) || amountOf(tip, tr.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_TIP');
          if (!(Number(tip) * 2 <= Number(tr.amount))) return err(400, 'ERR_INVALID_TIP');
          beforeTip = Number(tr.amount) - Number(tip);
        }
        if (present(body.items)) {
          const refusal = itemsRefusal(body.items, beforeTip, tr.currency, bank);
          if (refusal) return refusal;
        }
        if (present(tr.reasonL1) && tr.reasonL1.length > 100) return err(400, 'ERR_INVALID_REASONL1_LENGTH');
        if (present(tr.reasonL2) && tr.reasonL2.length > 100) return err(400, 'ERR_INVALID_REASONL2_LENGTH');
        // 60 up to the merchant's own ceiling, 600 unless raised (spec 24.3); on behalf, the merchant's (caller.partnerId).
        const ttl = body.trOptions?.timeToLive;
        const ceiling = PARTNERS[caller.partnerId]?.maxTransactionTtl ?? 600;
        if (!bank && present(ttl) && !inRange(ttl, 60, ceiling)) return err(400, 'ERR_INVALID_TTL');
        return qrRefusal(body.qrOptions) || barRefusal(body.barOptions);
      }
      case 'processTransaction': {
        const [id] = route.params;
        const tr = body.trData ?? {};
        if (!knownCurrency(tr.currency)) return err(400, 'ERR_UNKNOWN_CURRENCY');
        if (amountOf(tr.amount, tr.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_AMOUNT');
        // A bank names the grounds unless the id brings its own (a product, placement or soundbite).
        const reasonRequired = bank ? !/^(pr|pl|ps)/.test(id) : true;
        if (reasonRequired && !present(tr.reasonL1)) return err(400, 'ERR_MISSING_REASON');
        if (present(tr.quantity) && !(Number.isInteger(tr.quantity) && tr.quantity >= 1 && tr.quantity <= 99)) return err(400, 'ERR_INVALID_QUANTITY');
        // One tip rule for every payment (spec 24.1, TipService, FIValidationService). The tip: an institution's, a
        // plain decimal at the currency's scale above zero (400 ERR_INVALID_TIP); a merchant processing a payer's code
        // sends none (409). The amount: a payment the model knows (seeded) asks its amount and is paid exactly that,
        // never less (400 ERR_INVALID_AMOUNT), plus a tip only where the payer may tip (409 ERR_TIPS_NOT_ALLOWED: the
        // seeded pw's shop takes none, and IDS.TIPPED carries the merchant's tip already), at most the amount asked (400
        // ERR_INVALID_TIP), and exactly asked + tip (409 ERR_AMOUNT_NOT_TOTAL: no paying more without a tip). Offers,
        // sessions, POI sales and unseeded pw ids are taken to be in a shop that allows tips, with or without lines or
        // quantity; the model does not price them, so their amount is not checked here.
        if (present(tr.tip)) {
          if (!bank) return err(409, 'ERR_TIPS_NOT_ALLOWED');
          if (!/^\d{1,12}(\.\d{1,8})?$/.test(String(tr.tip).trim()) || amountOf(String(tr.tip).trim(), tr.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_TIP');
        }
        const known = this.transactions.get(id);
        if (bank && known && Number(known.amount) > 0) {
          const asked = Number(known.amount);
          const tip = present(tr.tip) ? Number(String(tr.tip).trim()) : null;
          if (Number(tr.amount) < asked) return err(400, 'ERR_INVALID_AMOUNT');
          if (tip !== null && !(known.tipsAllowed && !present(known.tip))) return err(409, 'ERR_TIPS_NOT_ALLOWED');
          if (tip !== null && tip > asked) return err(400, 'ERR_INVALID_TIP');
          if (Math.abs(Number(tr.amount) - (asked + (tip ?? 0))) > 1e-9) return err(409, 'ERR_AMOUNT_NOT_TOTAL');
        }
        if (body.deliveryAddress) {
          const a = body.deliveryAddress;
          if (!present(a.fullName) || a.fullName.length > 200) return err(400, 'ERR_INVALID_DELIVERY_ADDRESS');
          for (const field of ['streetAddressLine1', 'zipCode', 'city', 'country']) {
            if (!present(a[field])) return err(400, 'ERR_INVALID_DELIVERY_ADDRESS');
          }
          if (!/^[A-Za-z]{2}$/.test(a.country)) return err(400, 'ERR_INVALID_DELIVERY_COUNTRY');
        }
        return null;
      }
      case 'getTransaction':
      case 'getTransactionHistory': {
        const [id] = route.params;
        // Both look the id up as given: history only knows pw transactions.
        if (route.name === 'getTransactionHistory' && !id.startsWith('pw')) return err(404, 'ERR_TRANSACTION_NOT_FOUND');
        return offerQueryRefusal(req.query);
      }
      case 'quote': {
        const [id] = route.params;
        if (!/^(pr|pl|ps|pa)/.test(id)) return err(400, 'ERR_INVALID_TRANSACTION_ID');
        return offerQueryRefusal(req.query);
      }
      case 'setShopDelivery': {
        const rows = body.countries;
        if (!Array.isArray(rows) || rows.length > 250) return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
        const seen = new Set();
        for (const row of rows) {
          if (!/^[A-Za-z]{2}$/.test(row?.country ?? '')) return err(400, 'ERR_INVALID_DELIVERY_COUNTRY');
          if (!knownCurrency(row.currency) || amountOf(row.fee, row.currency) === null) return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
          if (present(row.freeAbove) && amountOf(row.freeAbove, row.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
          const key = `${row.country.toUpperCase()}/${row.currency}`;
          if (seen.has(key)) return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
          seen.add(key);
        }
        return null;
      }
      case 'setProductDelivery': {
        const rows = body.countries;
        if (!Array.isArray(rows)) return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
        for (const row of rows) {
          if (!/^[A-Za-z]{2}$/.test(row?.country ?? '')) return err(400, 'ERR_INVALID_DELIVERY_COUNTRY');
          // A row is either excluded with no surcharge, or not excluded with a surcharge of 0 or more.
          if (row.excluded === true ? present(row.surchargePerUnit) : (row.excluded !== false || amountOf(row.surchargePerUnit, 'EUR') === null)) {
            return err(400, 'ERR_INVALID_DELIVERY_SETTINGS');
          }
        }
        return null;
      }
      case 'finalizeTransaction':
        return this.#finalizeRefusal(route.params[0], body, caller);
      case 'runReport':
        if (!present(body.reportUnitId) || !/^[A-Za-z0-9_-]{1,64}$/.test(body.reportUnitId)) {
          return err(400, 'ERR_VALIDATION_FAILED', 'reportUnitId: Invalid report unit id');
        }
        return null;
      // ReportBaseController.validateRequestId / validateExportId: a request from another context is not
      // found, with the same 404 as one that does not exist (no existence oracle).
      case 'reportStatus':
      case 'exportReport':
        if (this.#reportHidden(route.params[0], caller)) return err(404, 'ERR_REPORT_REQUEST_NOT_FOUND');
        return null;
      case 'exportStatus':
      case 'downloadExport': {
        const requestId = this.reportExports.get(route.params[0]);
        if (requestId && this.#reportHidden(requestId, caller)) return err(404, 'ERR_REPORT_REQUEST_NOT_FOUND');
        return null;
      }
      case 'cancelReport': {
        const id = route.params[0];
        const requestId = this.reportRequests.has(id) ? id : this.reportExports.get(id);
        if (requestId && this.#reportHidden(requestId, caller)) return err(404, 'ERR_REPORT_REQUEST_NOT_FOUND');
        return null;
      }
      case 'setPoiPrice':
        if (!present(body.amount) || amountOf(body.amount, body.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_AMOUNT');
        if (!/^[A-Za-z]{3}$/.test(body.currency ?? '')) return err(400, 'ERR_VALIDATION_FAILED', 'currency: Currency must be a 3-letter ISO 4217 code');
        return null;
      case 'createProduct':
      case 'updateProduct':
        // DatesUtil.synchronizeDates: a start before today is refused, on create and on an update that
        // names one. An update naming neither date keeps the stored period (ProductService, 2026-11-11).
        if (startsBeforeToday(body.prData?.activeFrom)) return err(400, 'ERR_INVALID_ACTIVE_FROM_DATE');
        return null;
      case 'createSchedule':
      case 'updateSchedule':
        if (startsBeforeToday(body.dateFrom)) return err(400, 'ERR_INVALID_ACTIVE_FROM_DATE');
        return null;
      case 'uploadAudio':
      case 'recognise':
        if (!isMultipart) return err(415, 'ERR_UNSUPPORTED_MEDIA_TYPE');
        return null;
      case 'requestToken':
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return err(401, 'ERR_UNSUPPORTED_MEDIA_TYPE_FOR_OAUTH_REQUEST');
        if (body.grantType !== 'client_credentials') return err(400, 'ERR_UNSUPPORTED_GRANT_TYPE');
        if (!present(body.clientId)) return err(400, 'ERR_MISSING_CLIENT_ID');
        if (!present(body.clientSecret)) return err(400, 'ERR_MISSING_CLIENT_SECRET');
        if (OAUTH2_CLIENTS[body.clientId] !== body.clientSecret) return err(400, 'ERR_CLIENT_NOT_FOUND');
        return null;
      case 'getToken':
      case 'rotateToken': {
        const grant = OAUTH2_TOKENS[decodeURIComponent(route.params[0])];
        if (!grant || grant.isv !== caller.partnerId) return err(404, 'ERR_TOKEN_NOT_FOUND');
        return null;
      }
      default:
        return null;
    }
  }

  /** The execution lock's refusals (server docs/execution-lock.md, "Status transitions"). */
  #finalizeRefusal(id, body, caller) {
    const tx = this.transactions.get(id);
    if (!tx) return err(404, 'ERR_TRANSACTION_NOT_FOUND');
    const status = body.status;
    if (caller.type !== 'payment_institution') {
      if (status !== 'CANCELLED') return err(400, 'ERR_INVALID_STATUS');
      return tx.status === 'ACTIVE' ? null : err(409, 'ERR_ALREADY_PROCESSED');
    }
    switch (status) {
      case 'EXECUTING': {
        if (!present(body.transferType)) return err(400, 'ERR_MISSING_TRANSFER_TYPE');
        if (!TRANSFER_TYPES.includes(body.transferType)) return err(400, 'ERR_INVALID_TRANSFER_TYPE');
        if (!present(body.amount)) return err(400, 'ERR_MISSING_AMOUNT');
        if (amountOf(body.amount, body.currency, { positive: true }) === null) return err(400, 'ERR_INVALID_AMOUNT');
        if (!present(body.currency)) return err(400, 'ERR_MISSING_CURRENCY');
        // FIValidationService: a known currency, and the transaction's own.
        if (!knownCurrency(body.currency)) return err(400, 'ERR_UNKNOWN_CURRENCY');
        if (body.currency.toUpperCase() !== tx.currency) return err(400, 'ERR_SPECIFYING_CURRENCY_NOT_ALLOWED');
        if (tx.status === 'EXECUTING') {
          return JSON.stringify(lockOf(body)) === JSON.stringify(tx.lock) ? null : err(409, 'ERR_EXECUTION_MISMATCH');
        }
        if (tx.status !== 'ACTIVE' || !tx.processed) return err(409, 'ERR_ALREADY_PROCESSED');
        // Review S1 (FIValidationService.validateExecutionStart): the lock carries exactly the processed amount.
        if (Math.abs(Number(body.amount) - Number(tx.amount)) > 1e-9) return err(400, 'ERR_SPECIFYING_AMOUNT_NOT_ALLOWED');
        return null;
      }
      case 'CONFIRMED':
      case 'FAILED':
        if (status === 'FAILED' && !present(body.statusMessage)) return err(400, 'ERR_MISSING_STATUS_MESSAGE');
        if (tx.status === 'ACTIVE') return err(409, 'ERR_NOT_EXECUTING');
        if (tx.status === 'EXECUTING') return null;
        return tx.status === status ? null : err(409, 'ERR_ALREADY_PROCESSED');
      case 'DECLINED':
      case 'CANCELLED':
        return tx.status === 'ACTIVE' ? null : err(409, 'ERR_ALREADY_PROCESSED');
      default:
        return err(400, 'ERR_INVALID_STATUS');
    }
  }

  /** The answer to an accepted request, moving the model's state. */
  respond(req) {
    const [a, b] = this.route(req).params ?? [];
    switch (req.route) {
      case 'createTransaction':
        return { status: 200, body: transactionDto('pw87654321', { amount: req.json?.trData?.amount, currency: req.json?.trData?.currency }) };
      case 'getTransaction': {
        // A merchant's tip is on the read, inside amount, and leaves no tipsAllowed (TipService.markTipsAllowed).
        const known = this.transactions.get(a);
        return { status: 200, body: transactionDto(a, {
          status: known?.status === 'EXECUTING' && req.caller.type === 'payment_institution' ? 'EXECUTING' : 'ACTIVE',
          ...(known?.tip && { amount: known.amount, tip: known.tip })
        }) };
      }
      case 'processTransaction':
        // Processing a product, placement, soundbite or POI id answers with the pw transaction it made.
        return { status: 200, body: transactionDto(a.startsWith('pw') ? a : IDS.TX, { amount: req.json?.trData?.amount, currency: req.json?.trData?.currency }) };
      case 'finalizeTransaction':
        return this.#finalize(a, req.json ?? {});
      case 'getTransactionHistory':
        return { status: 200, body: transactionDto(a, { status: 'CONFIRMED', finalized: Date.UTC(2026, 10, 10, 9, 1, 0), fee: '0.10', feeVat: '0.02' }) };

      case 'listProducts': return { status: 200, body: [PRODUCT_DTO] };
      case 'createProduct':
      case 'getProduct':
      case 'updateProduct': return { status: 200, body: PRODUCT_DTO };
      // POST answers an ImageResponse; the GET variant answers the bytes.
      case 'productImage': return { status: 200, body: { id: a, type: req.json?.type ?? 'QR', format: req.json?.format ?? 'SVG', imageData: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') } };
      case 'listSchedules': return { status: 200, body: [SCHEDULE_DTO] };
      case 'createSchedule':
      case 'getSchedule':
      case 'updateSchedule': return { status: 200, body: SCHEDULE_DTO };
      case 'listAudios': return { status: 200, body: [] };

      case 'listReports': return {
        status: 200,
        body: [{ id: 1, version: '1', defaultFormat: 'pdf', clientVisible: true, path: '/reports/payware/processedTransactions', parameters: true, merchantVisible: true, isvVisible: true, bankVisible: true, plan: 'STD', name: 'Processed transactions', description: 'Transactions processed in the period' }]
      };
      case 'runReport': {
        const requestId = this.#nextReportId('3a81220c-2e38-4759-b067-');
        this.reportRequests.set(requestId, { ...PaywareModel.reportContext(req.caller), reportUnitId: req.json.reportUnitId });
        return { status: 200, body: { requestId, reportUnitId: req.json.reportUnitId, status: 'queued' } };
      }
      // ReportRequestService: the caller's own requests in the context it asks as (ReportRequestDTO).
      case 'listReportRequests': {
        const mine = PaywareModel.reportContext(req.caller);
        return {
          status: 200,
          body: [...this.reportRequests]
            .filter(([, r]) => r.partner === mine.partner && r.onBehalf === mine.onBehalf && r.reportUnitId === a)
            .map(([requestId], i) => ({ id: i + 1, requestId, requestStatus: 'finished', partnerId: mine.partner }))
        };
      }
      case 'listExports': {
        if (this.#reportHidden(a, req.caller)) return { status: 200, body: [] };
        return {
          status: 200,
          body: [...this.reportExports].filter(([, requestId]) => requestId === a)
            .map(([exportId], i) => ({ id: i + 1, requestId: a, exportId, exportStatus: 'finished', partnerId: PaywareModel.reportContext(req.caller).partner }))
        };
      }
      case 'reportStatus': return { status: 200, body: { requestId: a, status: 'finished', generatedAt: '2026-11-10T09:00:00Z' } };
      case 'exportReport': {
        // A request the model ran gets an export of its own, in its context; the seeded one IDS.EXPORT.
        if (!this.reportRequests.has(a)) return { status: 200, body: { outputResource: { exportId: IDS.EXPORT, status: 'queued' } } };
        const exportId = this.#nextReportId('4a81220c-2e38-4759-b067-');
        this.reportExports.set(exportId, a);
        return { status: 200, body: { outputResource: { exportId, status: 'queued' } } };
      }
      case 'exportStatus': return { status: 200, body: { exportId: a, status: 'finished' } };
      case 'downloadExport': return {
        status: 200,
        body: 'transactionId,amount,currency\npw12345678,10.00,EUR\n',
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="processedTransactions.csv"' }
      };

      case 'queryLogs': return { status: 200, body: { entries: [], hasMore: false } };
      case 'logStatus': return { status: 200, body: { available: true, totalSizeBytes: 0, fileCount: 0 } };

      case 'getShopDelivery': return {
        status: 200,
        body: { shopCode: a, countries: [{ country: 'BG', currency: 'EUR', fee: '5.00', freeAbove: '50.00' }] }
      };
      case 'setShopDelivery': {
        // The PUT answers the saved table and, only on the PUT and only when there are some, the shop's shippable
        // products its currencies leave deliverable nowhere (omitted when none, server NON_EMPTY).
        const countries = body0(req).countries ?? [];
        const currencies = new Set(countries.map(r => r.currency));
        const stranded = countries.length === 0 ? [] : SHIPPABLE_PRODUCTS
          .filter(p => p.shopCode === a && !currencies.has(p.currency))
          .map(({ productId, name, currency }) => ({ productId, name, currency }));
        return { status: 200, body: { shopCode: a, countries, ...(stranded.length > 0 && { undeliverableProducts: stranded }) } };
      }
      case 'getProductDelivery':
      case 'setProductDelivery': return {
        status: 200,
        body: { productId: a, countries: req.method === 'PUT' ? (body0(req).countries ?? []) : [{ country: 'RO', excluded: true }, { country: 'BG', excluded: false, surchargePerUnit: '3.00' }] }
      };
      case 'quote': {
        // As TransactionQuoteDTO (NON_NULL): quantity only for a product quote, never for a pa; deliveryCountry and
        // countryServed only when a country was given (the model's product is not shipped, so it is always served).
        const session = a.startsWith('pa');
        const quantity = session ? 1 : Number(req.query.quantity ?? 1);
        const country = req.query.deliveryCountry?.toUpperCase();
        return {
          status: 200,
          body: {
            transactionId: a, currency: 'EUR',
            ...(!session && { quantity }),
            ...(country && { deliveryCountry: country, countryServed: true }),
            items: [{ type: 'ITEM', productId: IDS.PRODUCT, name: 'Vase', quantity, unitPrice: '40.00', amount: (40 * quantity).toFixed(2) }],
            total: (40 * quantity).toFixed(2)
          }
        };
      }

      case 'listShops': return {
        status: 200,
        body: [{ id: 1, name: 'Main store', code: 'SHOP01', ecommerce: false, isDefault: true, paymentProfileId: 1, paymentProfileName: 'Default', merchantId: 1, merchantName: 'Test Merchant', country: 'BG', countryOverridden: false }]
      };

      case 'listPois': return { status: 200, body: [] };
      case 'createPoi': return { status: 201, body: { poiId: IDS.POI, name: req.json?.name, status: 'IDLE', isActive: true } };
      case 'createPoiBatch': return { status: 201, body: { created: (req.json?.pois ?? []).length, pois: [] } };
      case 'getPoi':
      case 'poiStatus': return { status: 200, body: { poiId: a, name: 'Till 1', status: 'IDLE', isActive: true } };
      case 'setPoiPrice': return { status: 200, body: { poiId: a, status: 'READY', amount: req.json.amount, currency: req.json.currency } };
      case 'cancelPoiPrice': return { status: 204, body: '' };
      case 'poiImage': {
        const format = req.query.format || 'PNG';
        return format === 'SVG'
          ? { status: 200, body: '<svg xmlns="http://www.w3.org/2000/svg"/>', headers: { 'Content-Type': 'image/svg+xml' } }
          : { status: 200, body: Buffer.from('89504e470d0a1a0a', 'hex'), headers: { 'Content-Type': format === 'JPG' ? 'image/jpeg' : 'image/png' } };
      }
      case 'placementImage': return { status: 200, body: Buffer.from('89504e470d0a1a0a', 'hex'), headers: { 'Content-Type': 'image/png' } };

      case 'createInvitation': return {
        status: 201,
        body: { invitationId: IDS.INVITATION, status: 'PENDING', type: 'REGISTRATION', email: req.json?.email, invitationLink: 'https://my.payware.eu/invitation/abc', expiresAt: '2026-11-24T09:00:00' }
      };
      case 'listInvitations': return { status: 200, body: { content: [], totalElements: 0, totalPages: 0, number: 0 } };
      case 'getInvitation': return { status: 200, body: { invitationId: Number(a), status: 'PENDING', type: 'REGISTRATION', email: 'merchant@example.com', expiresAt: '2026-11-24T09:00:00' } };
      case 'cancelInvitation': return { status: 204, body: '' };
      case 'reference': return { status: 200, body: REFERENCE[a] };

      case 'requestToken': return { status: 200, body: oauth2TokenDto('newTokenValue0000000', req.json.clientId, 'PENDING') };
      case 'listTokens': return { status: 200, body: Object.entries(OAUTH2_TOKENS).filter(([, g]) => g.isv === req.caller.partnerId).map(([t, g]) => oauth2TokenDto(t, g.merchant, g.status)) };
      case 'getToken': return { status: 200, body: oauth2TokenDto(decodeURIComponent(a), OAUTH2_TOKENS[decodeURIComponent(a)].merchant) };
      case 'rotateToken': return { status: 200, body: oauth2TokenDto('rotatedTokenValue000', OAUTH2_TOKENS[decodeURIComponent(a)].merchant) };

      case 'recognise': return {
        status: 200,
        body: { transactionId: IDS.PRODUCT, amount: '2.50', currency: 'EUR', reasonL1: 'Coffee', payeeFriendlyName: 'Test Shop', recognition: { id: IDS.RECOGNITION, confidence: 'CERTAIN' } }
      };
      default:
        return { status: 200, body: {} };
    }
  }

  #finalize(id, body) {
    const tx = this.transactions.get(id);
    const status = body.status;
    if (status === 'EXECUTING') {
      if (tx.status !== 'EXECUTING') {
        Object.assign(tx, { status: 'EXECUTING', lock: lockOf(body) });
      }
      // amount is net of the fee after the lock; the gross is payerAmount (TransactionDTO.ofFinalize).
      const gross = Number(body.amount);
      const fee = Number(body.fee ?? 0);
      const scale = CURRENCIES[body.currency] ?? 2;
      return {
        status: 200,
        body: transactionDto(id, {
          status: 'EXECUTING', transferType: body.transferType, currency: body.currency,
          amount: (gross - fee).toFixed(scale), payerAmount: gross.toFixed(scale),
          ...(body.fee !== undefined && { fee: body.fee, feeVat: (0).toFixed(scale) })
        })
      };
    }
    if (['CONFIRMED', 'FAILED', 'DECLINED', 'CANCELLED'].includes(status)) tx.status = status;
    return { status: 200, body: transactionDto(id, { status, ...(body.statusMessage && { statusMessage: body.statusMessage }), finalized: Date.now() }) };
  }
}

/** The JSON body of a request, or an empty object. */
const body0 = req => req.json ?? {};

/** What an identical EXECUTING repeat must match. */
const lockOf = body => ({ amount: body.amount, fee: body.fee, currency: body.currency, transferType: body.transferType });

// ---------------------------------------------------------------------------------------------------
// The four hosts
// ---------------------------------------------------------------------------------------------------

/**
 * Start payware: an API host and a soundbite host for sandbox and for production, each environment
 * with its own key pair, and the private keys written to a temp directory.
 *
 * @returns {Promise<Object>} { sandbox, production, soundbiteSandbox, soundbiteProduction, keyPaths,
 *   privateKeys, env(partnerType), all(), requests(), reset(), stop() }
 */
export async function startPayware() {
  const keys = { sandbox: generateTestKeyPair(), production: generateTestKeyPair() };
  const make = (host, environment) => new FakePaywareServer({
    publicKey: keys[environment].publicKey,
    model: new PaywareModel({ host, environment, publicKey: keys[environment].publicKey }),
    label: `${host === 'api' ? '' : 'soundbite-'}${environment}`
  });
  const servers = {
    sandbox: make('api', 'sandbox'),
    production: make('api', 'production'),
    soundbiteSandbox: make('soundbite', 'sandbox'),
    soundbiteProduction: make('soundbite', 'production')
  };
  await Promise.all(Object.values(servers).map(s => s.start()));

  const dir = await mkdtemp(join(tmpdir(), 'payware-mcp-model-'));
  const keyPaths = { sandbox: join(dir, 'sandbox-private-key.pem'), production: join(dir, 'production-private-key.pem') };
  await writeFile(keyPaths.sandbox, keys.sandbox.privateKey, 'utf8');
  await writeFile(keyPaths.production, keys.production.privateKey, 'utf8');

  const PARTNER_IDS = { merchant: 'TESTMRCH', isv: 'TESTISV1', payment_institution: 'TESTBANK' };
  const all = () => Object.values(servers);

  return {
    ...servers,
    dir,
    keyPaths,
    privateKeys: { sandbox: keys.sandbox.privateKey, production: keys.production.privateKey },
    partnerIds: PARTNER_IDS,
    /** The environment a tool of this role runs with: real paths, per-environment keys and hosts. */
    env(partnerType) {
      return {
        PAYWARE_PARTNER_TYPE: partnerType,
        PAYWARE_PARTNER_ID: PARTNER_IDS[partnerType],
        PAYWARE_SANDBOX_URL: `${servers.sandbox.url}/api`,
        PAYWARE_PRODUCTION_URL: `${servers.production.url}/api`,
        PAYWARE_SOUNDBITE_SANDBOX_URL: `${servers.soundbiteSandbox.url}/api`,
        PAYWARE_SOUNDBITE_PRODUCTION_URL: `${servers.soundbiteProduction.url}/api`,
        PAYWARE_SANDBOX_PRIVATE_KEY_PATH: keyPaths.sandbox,
        PAYWARE_PRODUCTION_PRIVATE_KEY_PATH: keyPaths.production,
        // Cleared, not inherited: src/config/env.js loads the working directory's .env.
        PAYWARE_OAUTH_CLIENT_ID: undefined,
        PAYWARE_OAUTH_CLIENT_SECRET: undefined,
        PAYWARE_DEFAULT_MERCHANT_ID: undefined
      };
    },
    all,
    /** Every request on every host, in arrival order, each labelled with its host. */
    requests() {
      return all().flatMap(s => s.requests).sort((x, y) => x.seq - y.seq);
    },
    reset() {
      for (const s of all()) {
        s.requests.length = 0;
        s.queue.length = 0;
        s.model.reset();
      }
    },
    async stop() {
      await Promise.all(all().map(s => s.stop()));
      await rm(dir, { recursive: true, force: true });
    }
  };
}
