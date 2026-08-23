/**
 * One place that turns an axios failure from the payware API into something an assistant can act on.
 *
 * Every module here used to do the same thing inline:
 *
 *     throw new Error(`Failed to get products: ${error.response?.data?.message || error.message}`);
 *
 * which keeps the server's sentence and throws away the two things that decide what to do next: the
 * HTTP status and the response headers. That is survivable for a 400 - the message names the bad
 * field - and it is not survivable for the statuses that are reachable on EVERY endpoint from
 * machinery no individual handler knows about:
 *
 *   - **429** is refused by `PartnerApiRateLimitFilter` before any handler runs, and carries a
 *     `Retry-After` header. Flattened to a string, "Rate limit exceeded. Please slow down your
 *     requests." reads like advice rather than like a number of seconds to wait, and the header -
 *     the only part that says how long - is gone.
 *   - **403** on an ISV call is nearly always the acting merchant's plan, not the ISV's own
 *     permissions. Without that hint the obvious next move is to re-check credentials that were
 *     never the problem.
 *   - **409** and **503** both mean "the request was not applied", i.e. retryable, and a bare
 *     message makes them indistinguishable from a 400, which is not.
 *
 * So this returns an Error whose message states the status, the payware error code, what it means,
 * and whether retrying is correct.
 */

/** Statuses reachable on any endpoint, with what a caller should actually do about each. */
const UNIVERSAL_STATUS_GUIDANCE = {
  401: {
    label: 'Unauthenticated',
    guidance:
      'The JWT was missing, malformed, expired, or signed with a key that does not match the ' +
      'partnerId. Check that the private key in keys/ belongs to the environment being called - a ' +
      'sandbox key against production authenticates as nobody. Not retryable as-is.'
  },
  403: {
    label: 'Forbidden',
    guidance:
      'Authenticated, but not permitted. On an ISV on-behalf call this is usually the MERCHANT\'s ' +
      'plan rather than the ISV\'s own permissions - the operating plan is the merchant\'s, and ' +
      'Basic merchants are outside the transaction, product, shop and report surfaces. Other ' +
      'causes: the shop is not in the ISV\'s assigned scope (ERR_SHOP_NOT_IN_SCOPE), the report is ' +
      'not available to this plan or partner type (ERR_REPORT_NOT_AVAILABLE), or a KYC gate. Not ' +
      'retryable without changing the plan, the scope, or the resource.'
  },
  409: {
    label: 'Conflict',
    guidance:
      'The request was well formed and conflicts with the current state - most often ' +
      'ERR_ALREADY_PROCESSED, which is the answer to submitting the same transaction twice. Treat ' +
      'it as "already done" rather than as a failure: re-read the transaction before retrying, or ' +
      'the retry will conflict again.'
  },
  429: {
    label: 'Rate limited',
    guidance:
      'The per-partner rate limit was exceeded and the request was NOT processed - nothing was ' +
      'created, updated or charged, so the identical request is safe to retry. Wait for the ' +
      'Retry-After value below before retrying, and add jitter if more than one worker is running, ' +
      'so that the retries do not re-synchronise into a second burst.'
  },
  503: {
    label: 'Service unavailable',
    guidance:
      'A dependency payware needs was unavailable - typically no fee configuration for the ' +
      'transaction currency (ERR_FEE_CONFIGURATION_UNAVAILABLE) or no exchange rate ' +
      '(ERR_MISSING_EXCHANGE_RATE). The caller did nothing wrong and the request was not applied, ' +
      'so retrying later is correct. If it persists, it is a payware-side configuration gap - ' +
      'report it rather than retrying indefinitely.'
  }
};

/**
 * Whether retrying the identical request is safe and meaningful.
 *
 * Deliberately narrow. 429 and 503 are the two statuses that state the request was not applied;
 * everything else either succeeded, conflicts, or needs the request changed first.
 */
export function isRetryable(status) {
  return status === 429 || status === 503;
}

/**
 * Seconds to wait before retrying, read from the response's Retry-After header.
 *
 * Returns null when the header is absent or is an HTTP-date rather than a delta-seconds value.
 * payware sends delta-seconds, but a proxy in front of it may not, and guessing a date's meaning is
 * worse than saying nothing.
 */
export function retryAfterSeconds(error) {
  const raw = error?.response?.headers?.['retry-after'] ?? error?.response?.headers?.['Retry-After'];
  if (raw === undefined || raw === null) return null;
  const seconds = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * Build the Error to throw for a failed payware API call.
 *
 * @param {Error} error      the axios error
 * @param {string} operation what was being attempted, e.g. 'get products' - phrased to follow "Failed to "
 * @returns {Error} an Error carrying `status`, `errorCode`, `retryable` and `retryAfterSeconds`
 *                  alongside a message that explains the status
 */
export function describeApiError(error, operation) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const errorCode = data?.errorCode || data?.code;
  const serverMessage = data?.message || error?.message;
  const correlationId = data?.correlationId;

  const parts = [`Failed to ${operation}`];
  const known = UNIVERSAL_STATUS_GUIDANCE[status];
  if (status) {
    parts.push(`: HTTP ${status}${known ? ` (${known.label})` : ''}`);
  } else {
    parts.push(':');
  }
  if (errorCode) parts.push(` [${errorCode}]`);
  if (serverMessage) parts.push(` ${serverMessage}`);

  const detail = [];
  if (known) detail.push(known.guidance);

  const retryAfter = retryAfterSeconds(error);
  if (retryAfter !== null) {
    detail.push(`Retry-After: ${retryAfter} seconds.`);
  } else if (status === 429) {
    // The filter always sets it, so its absence means something sat between us and payware.
    detail.push('No Retry-After header was returned; back off at least 60 seconds.');
  }

  // The single most useful thing to quote when reporting a problem to payware support, and it is
  // dropped entirely by a message-only error.
  if (correlationId) detail.push(`correlationId: ${correlationId} - quote this to payware support.`);

  const message = parts.join('') + (detail.length ? `\n\n${detail.join('\n')}` : '');

  const wrapped = new Error(message);
  wrapped.status = status;
  wrapped.errorCode = errorCode;
  wrapped.correlationId = correlationId;
  wrapped.retryable = isRetryable(status);
  wrapped.retryAfterSeconds = retryAfter;
  wrapped.cause = error;
  return wrapped;
}

/**
 * The `{ success: false, error: {...} }` shape the transaction and POI modules return instead of
 * throwing, built from one place.
 *
 * **The bug this exists to stop repeating.** Those modules each built the shape inline and read the
 * payware error code as `error.response?.data?.code`. payware does not send a `code` property. Its
 * error body is `{ errorCode, message, correlationId }` - `ApiError.errorCode`, with no
 * `@JsonProperty` renaming it - so `.code` was `undefined` on every payware error in every one of
 * those modules. Nothing failed loudly: the message still came through, so the shape looked healthy
 * while the machine-readable half of it was always empty. Anything branching on the code silently
 * took the else branch forever - `create-transaction.js` had exactly that, a hash-mismatch help text
 * gated on `data.code === 'ERR_INVALID_CONTENT_HASH'` that could never fire.
 *
 * `code` is still populated below, as an alias of `errorCode`, so that any caller still reading the
 * old property keeps working - it just now has a value.
 */
export function apiErrorResult(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const errorCode = data?.errorCode || data?.code;
  const retryAfter = retryAfterSeconds(error);
  const known = UNIVERSAL_STATUS_GUIDANCE[status];

  return {
    success: false,
    error: {
      message: data?.message || error?.message,
      status,
      errorCode,
      // Alias, kept populated for backward compatibility - see the note above.
      code: errorCode,
      correlationId: data?.correlationId,
      retryable: isRetryable(status),
      ...(retryAfter !== null && { retryAfterSeconds: retryAfter }),
      ...(known && { guidance: known.guidance }),
      details: data
    },
    timestamp: new Date().toISOString()
  };
}
