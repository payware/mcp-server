/**
 * The timeToLive of a merchant-created payment, checked and described the same way by the merchant and the ISV create
 * tools so that the two cannot drift apart (strategy/product/agentic-commerce-implementation-spec.md, 24.3).
 *
 * timeToLive: payware accepts 60 seconds up to the merchant's own ceiling (MerchantValidationService
 * .maxTransactionTtl): 600 by default, raised by the merchant in the portal (Settings > Authentication, Longest payment lifetime) up to 2,592,000 (30 days). On
 * behalf, an ISV gets the merchant's ceiling and cannot change it. This server cannot read the ceiling, so the local
 * check is the widest range any merchant may have, and the server refuses the rest with 400 ERR_INVALID_TTL.
 */

export const MIN_TIME_TO_LIVE = 60;

/** 30 days: the highest ceiling a merchant may set (server MerchantValidationService.MAX_TRANSACTION_TTL_CEILING). */
export const MAX_TIME_TO_LIVE = 2592000;

/** The ceiling a merchant has until it raises it in the portal (server DEFAULT_MAX_TRANSACTION_TTL). */
export const DEFAULT_TIME_TO_LIVE_CEILING = 600;

/**
 * Refuse a timeToLive no merchant may have, before sending. Absent is fine: the tools then send 120.
 * @throws {Error} naming the range and the server's code
 */
export function checkTimeToLive(timeToLive) {
  if (timeToLive === undefined || timeToLive === null) return;
  const value = typeof timeToLive === 'string' && /^\d+$/.test(timeToLive.trim()) ? Number(timeToLive) : timeToLive;
  if (!Number.isInteger(value) || value < MIN_TIME_TO_LIVE || value > MAX_TIME_TO_LIVE) {
    throw new Error(
      `timeToLive must be a whole number of seconds from ${MIN_TIME_TO_LIVE} to ${MAX_TIME_TO_LIVE} (30 days). ` +
      `payware refuses anything else with 400 ERR_INVALID_TTL, and so anything above the merchant's own ceiling ` +
      `(${DEFAULT_TIME_TO_LIVE_CEILING} unless the merchant raised it in the portal (Settings > Authentication, Longest payment lifetime)).`
    );
  }
}

/** The parameter's description, shared by both create tools. */
export const TIME_TO_LIVE_DESCRIPTION =
  'Time allowed for payment initiation in seconds (sent as trOptions.timeToLive; 120 when left out). payware accepts 60 ' +
  'up to the merchant\'s own ceiling: 600 by default, which the merchant can raise in the portal (Settings > Authentication, Longest payment lifetime) up to 2592000 ' +
  '(30 days). Above the ceiling is 400 ERR_INVALID_TTL; this tool checks 60 to 2592000 only, as it cannot see the ' +
  'ceiling. An ISV acting for a merchant gets that merchant\'s ceiling and cannot change it. The e-commerce plugins keep ' +
  '60-600, because their buyer is waiting at the checkout. Once the payer\'s institution has started the payment, the ' +
  'transaction stays ACTIVE past it until the money has moved (seconds for an instant transfer, days with ' +
  'deferredAllowed); never infer EXPIRED from the clock.';

/** One paragraph for a create tool's description. */
export const TIME_TO_LIVE_PARAGRAPH = `⏱️ **PAYMENT LIFETIME** (\`timeToLive\`, sent as \`trOptions.timeToLive\`, 120 seconds when left out): payware accepts 60 seconds up to the merchant's own ceiling, which is 600 by default and which the merchant can raise in the portal (Settings > Authentication, Longest payment lifetime) up to 2,592,000 (30 days). Above the ceiling the server answers 400 \`ERR_INVALID_TTL\`. This tool checks 60 to 2,592,000 before sending; only payware knows the ceiling. An ISV acting for a merchant gets that merchant's ceiling and cannot change it. The e-commerce plugins keep 60-600, because their buyer is waiting at the checkout.`;

