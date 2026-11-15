import axios from 'axios';
import { getLinksUrl } from '../config/env.js';

/**
 * The public link host, as a buying agent uses it: `GET /links/{id}` to read a link or follow a
 * payment, `GET /links/{prOrPl}/price` to price one before buying, and `POST /links/{prOrPl}/sessions`
 * to open a purchase session. No partner ID, no key and
 * no JWT: the host is public and unauthenticated by design (server LinkLookupController and the
 * session endpoint beside it). Nothing here signs anything, which is why the PAYER role needs no
 * configuration at all.
 *
 * What a payer may fetch is deliberately narrow. Every call goes to the configured link host
 * (getLinksUrl), never to a host taken from a link the model was handed, so a link pointing somewhere
 * else cannot make this server call an address of the link author's choosing.
 */

/** A link id: two lowercase letters (pr, pl, ps, pa, pw, pi, ...) and 8 to 30 letters or digits. */
const LINK_ID = /^[a-z]{2}[0-9A-Za-z]{8,30}$/;

/** Hosts a payware payment link is real on. Anything else is refused before any request is made. */
export const LINK_HOSTS = [
  'go.payware.eu',
  'paywa.re',
  'go-sandbox.payware.eu',
  'sandbox.paywa.re',
  // Local development: the server serves /links/** itself.
  'localhost',
  '127.0.0.1'
];

/** The public link hosts and whether each is the sandbox: a full link on one of them names its environment. */
const PUBLIC_LINK_HOSTS = { 'go.payware.eu': false, 'paywa.re': false, 'go-sandbox.payware.eu': true, 'sandbox.paywa.re': true };

/**
 * The useSandbox to call with for what the person gave: a full link on a public link host decides production or
 * sandbox, whatever useSandbox says, because the link came from there (llms.txt: use the host the link came from). A
 * bare id, a localhost link, or an explicit PAYWARE_LINKS_BASE_URL (a local server, the tests) keeps the configured
 * host. Review finding C-M1: a real go.payware.eu link was read on the sandbox and answered 404.
 * @param {string} input an id or a link
 * @param {boolean} [useSandbox=true]
 * @returns {boolean}
 */
export function sandboxFor(input, useSandbox = true) {
  if ((process.env.PAYWARE_LINKS_BASE_URL || '').trim()) {
    return useSandbox;
  }
  const text = String(input ?? '').trim();
  if (LINK_ID.test(text)) {
    return useSandbox;
  }
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname;
    return Object.hasOwn(PUBLIC_LINK_HOSTS, host) ? PUBLIC_LINK_HOSTS[host] : useSandbox;
  } catch {
    return useSandbox;
  }
}

/** Session lines the server accepts: 1 to 20 lines, each quantity 1 to 99 (agent purchase sessions). */
const MAX_LINES = 20;

/**
 * The link id inside what the person or the page gave: a bare id, or a full link on one of the payware
 * link hosts (https://go.payware.eu/{id}, https://paywa.re/{id}, their sandbox twins, localhost, or the
 * configured PAYWARE_LINKS_BASE_URL host). A link on any other host is refused: a payment link is real
 * only on those, and an assistant must not treat a look-alike as one.
 *
 * @param {string} input an id or a link
 * @param {boolean} [useSandbox=true]
 * @returns {string} the id
 * @throws {Error} when no id can be read, or the link is on a host that is not a payware link host
 */
export function extractLinkId(input, useSandbox = true) {
  const text = String(input ?? '').trim();
  if (LINK_ID.test(text)) {
    return text;
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error(`"${text}" is not a payware link or link id (an id looks like pr12345678 or pa12345678).`);
  }
  const allowed = new Set(LINK_HOSTS);
  try {
    allowed.add(new URL(getLinksUrl(useSandbox)).hostname);
  } catch {
    // An unparsable PAYWARE_LINKS_BASE_URL fails at the request, with its own message.
  }
  if (!['http:', 'https:'].includes(url.protocol) || !allowed.has(url.hostname)) {
    throw new Error(
      `${url.hostname || text} is not a payware link host. Payment links are real only on go.payware.eu and paywa.re ` +
      '(go-sandbox.payware.eu and sandbox.paywa.re for sandbox, localhost for local development). Do not pay it, and do not follow it.'
    );
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'links') segments.shift();
  const id = segments[0];
  if (!id || !LINK_ID.test(id)) {
    throw new Error(`No payware link id in "${text}" (an id looks like pr12345678 or pa12345678).`);
  }
  return id;
}

/**
 * Seconds a Retry-After header asks for: a number of seconds, or an HTTP date. Undefined when absent or unreadable.
 * The link host sends one with every 429 (server RateLimitingFilter: 60 seconds).
 * @param {string|undefined} value
 * @returns {number|undefined}
 */
export function retryAfterSeconds(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** The failure shape the payer tools return. The link host answers with the same error body as the API. */
function failure(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const body = data && typeof data === 'object' ? data : undefined;
  const retryAfter = retryAfterSeconds(error?.response?.headers?.['retry-after']);
  return {
    success: false,
    error: {
      message: body?.message || (typeof data === 'string' && data.slice(0, 300)) || error?.message,
      status,
      errorCode: body?.errorCode,
      correlationId: body?.correlationId,
      ...(retryAfter !== undefined && { retryAfterSeconds: retryAfter }),
      details: body
    },
    timestamp: new Date().toISOString()
  };
}

const REQUEST = { timeout: 15000, headers: { Accept: 'application/json' } };

/**
 * Read a link: GET {linksBase}/links/{id}.
 * @returns {Promise<Object>} { success, link, requestId, timestamp } or { success: false, error }
 */
export async function readLink({ id, useSandbox = true }) {
  try {
    const response = await axios.get(`${getLinksUrl(useSandbox)}/links/${encodeURIComponent(id)}`, REQUEST);
    return {
      success: true,
      link: response.data,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The body of a session request, checked before it is sent: `lines` or `quantity`, never both, and the
 * server's limits on each.
 * @throws {Error}
 */
export function sessionBody({ lines, quantity, deliveryAddress }) {
  if (lines !== undefined && quantity !== undefined) {
    throw new Error('Give lines or quantity, not both: quantity is the shorthand for one line of the link\'s own product.');
  }
  const body = {};
  if (lines !== undefined) {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) {
      throw new Error(`lines must hold 1 to ${MAX_LINES} entries, each {productId, quantity}.`);
    }
    const seen = new Set();
    for (const line of lines) {
      if (!line || typeof line.productId !== 'string' || !line.productId) {
        throw new Error('Every line needs a productId.');
      }
      if (seen.has(line.productId)) {
        throw new Error(`Product ${line.productId} is on two lines: one line per product, with the total quantity.`);
      }
      seen.add(line.productId);
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
        throw new Error(`The quantity of ${line.productId} must be a whole number from 1 to 99.`);
      }
    }
    body.lines = lines.map(({ productId, quantity: q }) => ({ productId, quantity: q }));
  }
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('quantity must be a whole number from 1 to 99.');
    }
    body.quantity = quantity;
  }
  if (deliveryAddress !== undefined) {
    body.deliveryAddress = deliveryAddress;
  }
  return body;
}

/**
 * Open a purchase session: POST {linksBase}/links/{prOrPl}/sessions.
 * @returns {Promise<Object>} { success, session, location, requestId, timestamp } or { success: false, error }
 */
export async function createSession({ id, lines, quantity, deliveryAddress, useSandbox = true }) {
  const body = sessionBody({ lines, quantity, deliveryAddress });
  try {
    const response = await axios.post(`${getLinksUrl(useSandbox)}/links/${encodeURIComponent(id)}/sessions`, body, {
      ...REQUEST,
      headers: { ...REQUEST.headers, 'Content-Type': 'application/json' }
    });
    return {
      success: true,
      session: response.data,
      location: response.headers['location'],
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return failure(error);
  }
}

/** Ids the price check answers for: a product (pr) or a placement (pl) link. */
const PRICEABLE_ID = /^p[rl][0-9A-Za-z]{8,30}$/;

/**
 * The query of a price check, checked before it is sent: an optional ISO 3166-1 alpha-2 country and an
 * optional quantity from 1 to 99, the server's limits (AgentSessionService.pagePrice).
 * @returns {string} '' or '?country=BG&quantity=2'
 * @throws {Error}
 */
export function priceQuery({ country, quantity }) {
  const params = new URLSearchParams();
  if (country !== undefined) {
    if (typeof country !== 'string' || !/^[A-Za-z]{2}$/.test(country.trim())) {
      throw new Error('country must be an ISO 3166-1 alpha-2 code, such as BG.');
    }
    params.set('country', country.trim().toUpperCase());
  }
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('quantity must be a whole number from 1 to 99.');
    }
    params.set('quantity', String(quantity));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Price a product or placement link without opening a session: GET {linksBase}/links/{prOrPl}/price.
 * Writes nothing and takes no address. Only pr and pl links have a price check (the link hosts route
 * nothing else there); a session already carries its price, so read it instead.
 * @returns {Promise<Object>} { success, price, requestId, timestamp } or { success: false, error }
 * @throws {Error} for an id that is not a product or placement link, or a country or quantity the server would refuse
 */
export async function priceLink({ id, country, quantity, useSandbox = true }) {
  if (!PRICEABLE_ID.test(id)) {
    throw new Error(`${id} is not a product or placement link (pr or pl). A session (pa) already carries its price: read it with payware_payer_read_link.`);
  }
  const query = priceQuery({ country, quantity });
  try {
    const response = await axios.get(`${getLinksUrl(useSandbox)}/links/${encodeURIComponent(id)}/price${query}`, REQUEST);
    return {
      success: true,
      price: response.data,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Link statuses the watch stops on (server LinkLookupResponse.Status). PAID, NOT_PAID, EXPIRED and CANCELLED end a
 * payment (a pw link, or a POI's sale): nothing changes after them. UNAVAILABLE means nothing can be paid now (a
 * session line or a product went off sale): the agent reads the link again rather than waiting. A session (pa) is never
 * NOT_PAID itself: after a failed attempt it is AVAILABLE again with `lastPayment.status` NOT_PAID, and the person may
 * retry from the same link, so the watch goes on. WAITING, IN_PROGRESS, AVAILABLE and NO_PAYMENT_WAITING are not
 * final; UNKNOWN arrives with a 404, which ends the watch as an error. Review finding C-M3.
 */
export const FINAL_STATUSES = ['PAID', 'NOT_PAID', 'EXPIRED', 'CANCELLED', 'UNAVAILABLE'];

export const WATCH_DEFAULT_SECONDS = 120;
export const WATCH_MAX_SECONDS = 600;
export const WATCH_INTERVAL_MS = 3000;
/** The longest a Retry-After makes the watch wait before its next read; the link host asks for 60 s on a 429. */
export const WATCH_RETRY_AFTER_MAX_SECONDS = 60;

const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll a link until its status is final (FINAL_STATUSES), or the time is up.
 *
 * A transient failure (a network error, a 5xx, a 429) does not end the watch: it is remembered and the
 * next poll tries again, because a payment in progress must not be reported lost over one dropped
 * request. A 4xx other than 429 does end it (the link is not there, or the id is wrong), and a time-out
 * is a result, not an error: the payer may simply not have approved yet.
 *
 * A Retry-After on a failed read (every 429 carries one) is honoured: the next read waits that long, at most
 * WATCH_RETRY_AFTER_MAX_SECONDS and never less than the poll interval. When the wait would run past the deadline the
 * watch returns at once, timed out, with the error and its `retryAfterSeconds`, rather than polling against the limit.
 *
 * @param {Object} params
 * @param {string} params.id the link id, normally a pa
 * @param {number} [params.timeoutSeconds] default 120, at most 600
 * @param {boolean} [params.useSandbox]
 * @param {number} [params.intervalMs] poll interval, 3000 unless a test says otherwise
 * @param {Function} [params.sleep] awaited between polls, replaceable in tests
 * @returns {Promise<Object>} { success, final, timedOut, link, polls, elapsedSeconds, lastError? }
 */
export async function watchLink({
  id,
  timeoutSeconds = WATCH_DEFAULT_SECONDS,
  useSandbox = true,
  intervalMs = WATCH_INTERVAL_MS,
  sleep = sleepFor
}) {
  const seconds = Math.min(Math.max(Number(timeoutSeconds) || WATCH_DEFAULT_SECONDS, 1), WATCH_MAX_SECONDS);
  const started = Date.now();
  const deadline = started + seconds * 1000;
  let polls = 0;
  let link;
  let lastError;

  for (;;) {
    polls += 1;
    const result = await readLink({ id, useSandbox });
    if (result.success) {
      link = result.link;
      lastError = undefined;
      if (FINAL_STATUSES.includes(link?.status)) {
        return { success: true, final: true, timedOut: false, link, polls, elapsedSeconds: Math.round((Date.now() - started) / 1000) };
      }
    } else {
      lastError = result.error;
      const status = result.error.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        return { success: false, final: false, timedOut: false, link, polls, lastError, elapsedSeconds: Math.round((Date.now() - started) / 1000) };
      }
    }
    const asked = lastError?.retryAfterSeconds;
    const waitMs = asked === undefined
      ? intervalMs
      : Math.max(intervalMs, Math.min(asked, WATCH_RETRY_AFTER_MAX_SECONDS) * 1000);
    if (Date.now() + waitMs >= deadline) {
      return {
        success: true,
        final: false,
        timedOut: true,
        link,
        polls,
        ...(lastError && { lastError }),
        elapsedSeconds: Math.round((Date.now() - started) / 1000)
      };
    }
    await sleep(waitMs);
  }
}
