/**
 * The merchant's per-transaction opt-in to a deferred Merchant Leg, `trOptions.deferredAllowed`
 * (server docs/execution-lock.md), checked the same way by the merchant and the ISV create tools.
 *
 * With it, the payer's institution may pay by a credit transfer that settles later instead of an
 * instant or internal one. A terminal sale never may: the server answers an opt-in that carries
 * producer or terminal fields with 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED, and the tools say so
 * before sending, naming the fields.
 */

export const TERMINAL_FIELDS = ['producerPartnerId', 'terminalId', 'terminalManufacturer'];

/**
 * Refuse what the server would refuse. `fields` holds whatever producer and terminal values the
 * caller passed, keyed by name.
 */
export function checkDeferredAllowed(deferredAllowed, fields = {}) {
  if (deferredAllowed !== undefined && typeof deferredAllowed !== 'boolean') {
    throw new Error('deferredAllowed must be true or false');
  }
  if (deferredAllowed !== true) return;

  // Blank counts as absent, as MerchantValidationService.isPresent has it.
  const terminalFields = TERMINAL_FIELDS
    .filter(field => fields[field] !== undefined && fields[field] !== null && String(fields[field]).trim() !== '');
  if (terminalFields.length > 0) {
    throw new Error(
      `deferredAllowed cannot be combined with ${terminalFields.join(', ')} (ERR_DEFERRED_TRANSFER_NOT_ALLOWED): ` +
      'a terminal sale is paid by an instant or internal transfer only. Omit deferredAllowed for a till payment.'
    );
  }
}

/** The trOptions entry: sent only when true, as false is the default and payware echoes it only when set. */
export function deferredAllowedOption(deferredAllowed) {
  return deferredAllowed === true ? { deferredAllowed: true } : {};
}

/** The parameter's description, shared so that the two tools cannot drift apart. */
export const DEFERRED_ALLOWED_DESCRIPTION =
  'Opt this transaction in to a deferred Merchant Leg (sent as trOptions.deferredAllowed). Optional; omit it for ' +
  'instant or internal only. When true, the payer\'s institution may also pay by an ordinary credit transfer that ' +
  'settles later. Not for a terminal sale: combined with producerPartnerId, terminalId or terminalManufacturer it is ' +
  'refused with 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED. A deferred payment stays ACTIVE (pending) until the transfer ' +
  'settles, which can take days and can outlast timeToLive: keep polling or wait for the callback, never treat it as ' +
  'expired yourself. Echoed as deferredAllowed: true when set.';
