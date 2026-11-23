import { createHmac, createPrivateKey } from 'node:crypto';

/**
 * payerPseudonym: the institution's pseudonymous reference for the customer who pays (kb
 * tech/financial-institution/api, "Payer pseudonym"), from which payware counts a merchant's new and
 * returning customers. The institution sends it on the requests it makes for the payer: processing a payment it
 * did not create as payer (pw, pr, pl, ps, pa and POI ids, and a P2P payment its customer pays) and
 * creating one as payer (role SRC). It is not sent when the institution acts for the payee, where payware
 * ignores it, and never on finalize. These tools send it there by default, so that a test payment counts
 * as the institution's customer does.
 *
 * The server's rules: 16 to 64 characters of A-Z a-z 0-9 . _ : -, the same every time for the same
 * customer of the institution, whatever the merchant and whichever of the customer's accounts pays. Yours, and
 * private to the institution: a reference it already keeps for the customer works as it is (one it assigned at
 * random, say), as long as no one outside it can link it to the customer; where it has none, it derives one from
 * its own customer identifier (not from an account) with a one-way keyed function. Never a name, account number,
 * phone number, email address or customer number. A malformed value, one with @, or an
 * IBAN (the IBAN shape with valid check digits, as the server's PayerPseudonymService.looksLikeIban) is
 * 400 ERR_INVALID_PAYER_PSEUDONYM and nothing is created. The server accepts a call without one. payware never stores or returns
 * it: it keeps only keys derived from it, uses them for statistics, and shows merchants only totals of their
 * own customers, never anything that identifies a payer.
 *
 * A bank without such a reference derives it on its server, over its own customer identifier, with a secret only
 * the bank holds.
 * These tools have no customers, so they derive it the same way from what they have: HMAC-SHA-256 keyed
 * with the institution's private key (its PKCS#8 DER bytes, so the key's text format does not matter), the
 * one secret the tool holds, over "payware payer pseudonym", the partner id and a payer reference (by default
 * one test payer per institution), one per line. The reference wallet (integration-tool-set PayerPseudonym)
 * uses the same recipe, so one test customer id gives one pseudonym in both tools for the same bank key. Nothing about the merchant or the account goes
 * in, so one payer reference is one customer to every merchant. The key never leaves the process, the
 * value says nothing about it, and 64 hex characters are longer than any IBAN.
 */

export const PAYER_PSEUDONYM_PATTERN = '^[A-Za-z0-9._:-]{16,64}$';
const PATTERN = new RegExp(PAYER_PSEUDONYM_PATTERN);
/** An IBAN's shape (ISO 13616: a country code, two check digits and 11 to 30 more), in either case. */
const IBAN_SHAPE = /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}$/;

/**
 * The IBAN shape with valid check digits (ISO 7064 MOD 97-10), as the server refuses it. The bare shape alone would
 * refuse about one random 32-character hex pseudonym in eighteen, so the server, and this check, refuse only a value
 * whose check digits are those of a real account number.
 */
export function looksLikeIban(value) {
  const text = String(value);
  if (!IBAN_SHAPE.test(text)) return false;
  const upper = text.toUpperCase();
  const rearranged = upper.slice(4) + upper.slice(0, 4);
  let remainder = 0;
  for (const c of rearranged) {
    const digits = c >= '0' && c <= '9' ? c : String(c.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/** The payer the tools pay as when the caller names none. */
export const DEFAULT_PAYER_REFERENCE = 'mcp-test-payer';

const isBlank = value => value === undefined || value === null || value === '';

/**
 * Refuse a payerPseudonym the server would refuse, before anything is signed or sent.
 * @returns {string} the value as it goes on the wire
 */
export function checkPayerPseudonym(value) {
  const text = String(value);
  if (text.includes('@')) {
    throw new Error('payerPseudonym contains @, which payware refuses (400 ERR_INVALID_PAYER_PSEUDONYM): it is never an email address');
  }
  if (!PATTERN.test(text)) {
    throw new Error('payerPseudonym must be 16 to 64 characters of A-Z a-z 0-9 . _ : - (payware refuses anything else with 400 ERR_INVALID_PAYER_PSEUDONYM)');
  }
  if (looksLikeIban(text)) {
    throw new Error('payerPseudonym is an IBAN (its check digits are valid), which payware refuses (400 ERR_INVALID_PAYER_PSEUDONYM): it is never an account number. Derive it one way from your own customer identifier, or send payerReference and let the tool derive it');
  }
  return text;
}

/** HMAC-SHA-256, keyed with the institution's private key (PKCS#8 DER), over the partner id and the payer reference: 64 hex characters. */
export function derivePayerPseudonym({ privateKey, partnerId, payerReference = DEFAULT_PAYER_REFERENCE }) {
  if (!privateKey) {
    throw new Error('payerPseudonym is derived with your private key, and none is configured');
  }
  let key;
  try {
    key = createPrivateKey(String(privateKey)).export({ type: 'pkcs8', format: 'der' });
  } catch {
    throw new Error('payerPseudonym is derived with your private key, and the configured one cannot be read as a private key');
  }
  return createHmac('sha256', key)
    .update(`payware payer pseudonym\n${partnerId ?? ''}\n${payerReference}`)
    .digest('hex');
}

/**
 * The payerPseudonym to send: the caller's own, checked, or one derived from payerReference (default: the
 * tools' one test payer).
 * @returns {{ value: string, derivedFrom: string|null }} derivedFrom is the reference it was derived from, null for the caller's own
 */
export function resolvePayerPseudonym({ payerPseudonym, payerReference, privateKey, partnerId }) {
  if (!isBlank(payerPseudonym)) {
    if (!isBlank(payerReference)) {
      throw new Error('Send payerPseudonym or payerReference, not both: payerReference is what the tool derives payerPseudonym from');
    }
    return { value: checkPayerPseudonym(payerPseudonym), derivedFrom: null };
  }
  const reference = isBlank(payerReference) ? DEFAULT_PAYER_REFERENCE : String(payerReference);
  return { value: derivePayerPseudonym({ privateKey, partnerId, payerReference: reference }), derivedFrom: reference };
}

/** One line for a tool's result, saying what was sent and where it came from. */
export function payerPseudonymLine(resolved) {
  if (!resolved) return '';
  const origin = resolved.derivedFrom === null
    ? 'yours'
    : `derived with your key from payerReference "${resolved.derivedFrom}"`;
  return `- Payer pseudonym: ${resolved.value} (${origin}; payware never returns it)`;
}

/** The two parameters, shared by the create and process tools so that they cannot drift apart. */
export const PAYER_PSEUDONYM_PROPERTIES = {
  payerPseudonym: {
    type: 'string',
    description: 'Your pseudonymous reference for the customer who pays, sent as payerPseudonym. payware counts the merchant\'s new and returning customers from it. payware ignores it when you act for the payee, so the tool sends it only for the payer. 16 to 64 characters of A-Z a-z 0-9 . _ : -, the same every time for the same customer of your institution, whatever the merchant and whichever of the customer\'s accounts pays, derived one way from your own customer identity, not from an account (for example HMAC-SHA-256 with a secret only your institution holds); never a name, account number, phone number, email address or customer number. A malformed value, one with @, or an IBAN is 400 ERR_INVALID_PAYER_PSEUDONYM. payware never stores or returns it: it keeps only keys derived from it, and shows merchants only totals of their own customers. Without it the tool derives one from payerReference.',
    pattern: PAYER_PSEUDONYM_PATTERN,
    minLength: 16,
    maxLength: 64
  },
  payerReference: {
    type: 'string',
    description: `Optional: your own identifier for the payer, for example a test customer number. Never sent: the tool derives payerPseudonym from it with HMAC-SHA-256 keyed with your private key, so the same reference always gives the same pseudonym, whatever the merchant, and another reference is another customer. Default: one test payer per institution ("${DEFAULT_PAYER_REFERENCE}"). Not together with payerPseudonym.`,
    minLength: 1,
    maxLength: 200
  }
};
