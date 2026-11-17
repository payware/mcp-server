/**
 * `items` on a merchant-created payment: the lines a payer's bank shows (what was bought, the delivery,
 * a discount, a tax), so the payer sees more than one amount.
 *
 * One definition for the merchant and the ISV create tools (server TransactionRequest.items, validated
 * in MerchantValidationService; strategy/product/agentic-commerce-implementation-spec.md, 22.1 and
 * 22.6). The lines are display and reconciliation data: they change nothing about who is paid or what
 * the fee is, and they must sum exactly to `amount`. The server checks the sum and the scale, so this
 * only checks the shape and says the rules where an assistant reads them.
 *
 * A merchant line never carries `country`: on payware's own lines it means "payware priced this delivery for this
 * country", which banks and the link page rely on, so the server refuses it on a merchant's line (ERR_INVALID_ITEMS,
 * VG 2026-11-15, review findings B-A7 and C-M4). An empty list is refused too (ERR_ITEMS_EMPTY): leave items out.
 *
 * A tip is never a line (spec 24.1, one tip rule, VG 2026-11-17): it is recorded on the payment and returned as `tip`,
 * so `items` and `total` stay what was sold. A merchant's own tip goes in `trData.tip` (a till that asked the payer
 * first), with `trData.amount` the total paid, tip included, and the lines adding up to the amount before the tip. A
 * TIP line is an unknown type to the server (ERR_INVALID_ITEMS).
 */

/** The line types a merchant may send in its own items. */
export const ITEM_TYPES = ['ITEM', 'SHIPPING', 'DISCOUNT', 'TAX', 'SURCHARGE'];

/** The line types payware returns (reads, history, callbacks): the same as a merchant's. A tip is never a line. */
export const LINE_TYPES = [...ITEM_TYPES];

const AMOUNT = '^-?\\d+(\\.\\d+)?$';

/** The `items` parameter of a create tool. */
export const ITEMS_PROPERTY = {
  type: 'array',
  minItems: 1,
  maxItems: 50,
  description:
    'Optional lines the payer\'s bank shows, 1 to 50, e.g. [{"type":"ITEM","name":"Vase","quantity":2,"unitPrice":"40.00","amount":"80.00"},{"type":"SHIPPING","name":"Delivery","amount":"5.00"}]. ' +
    'The lines must sum EXACTLY to amount, or to amount minus tip when you send one (400 ERR_ITEMS_DO_NOT_SUM otherwise; anything else malformed is 400 ERR_INVALID_ITEMS; an empty list is 400 ERR_ITEMS_EMPTY: send at least one line or leave items out). ' +
    'ITEM: quantity 1-99, unitPrice 0 or more, amount = quantity x unitPrice. DISCOUNT: amount below 0. Every other type: amount 0 or more. ' +
    'Amounts are decimal strings at the currency\'s payable scale, at most 15 significant and 15 integer digits. Needs an amount above zero. No images, product ids or country here: payware sets country only on the delivery lines it prices. ' +
    'No TIP line (400 ERR_INVALID_ITEMS): a tip is never a line. Your own goes in tip; the payer\'s, added in their bank where your shop allows tips, comes back as tip too.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ITEM_TYPES, description: 'Kind of line. Default ITEM' },
      name: { type: 'string', minLength: 1, maxLength: 100, description: 'What the line is, 1 to 100 characters, no control characters' },
      quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'ITEM lines only: 1 to 99' },
      unitPrice: { type: 'string', pattern: AMOUNT, description: 'ITEM lines only: price of one unit, 0 or more' },
      amount: { type: 'string', pattern: AMOUNT, description: 'The line total. Negative only on a DISCOUNT' }
    },
    required: ['name', 'amount']
  }
};

/** One paragraph for a create tool's description. */
export const ITEMS_DESCRIPTION = `🧾 **LINES** (\`items\`, root level, optional): what the payer's bank shows instead of one amount - items with quantity and unit price, delivery, discounts, taxes. 1-50 lines that sum exactly to \`trData.amount\`, or to \`trData.amount\` minus \`tip\` when you send one (400 \`ERR_ITEMS_DO_NOT_SUM\`); malformed lines, or a line with a \`country\` (payware sets it only on delivery lines it prices), are 400 \`ERR_INVALID_ITEMS\`; an empty list is 400 \`ERR_ITEMS_EMPTY\` (leave \`items\` out instead). Not for an amount of 0. Every payment, with lines or without, is paid exactly the amount it asks (the payer's bank gets 409 \`ERR_AMOUNT_NOT_TOTAL\` for anything else), plus a tip where one is allowed. A tip is never a line: a \`TIP\` line in your \`items\` is 400 \`ERR_INVALID_ITEMS\`. payware records the tip on the payment and returns it as \`tip\` beside \`items\` and \`total\`, which stay what was sold: the payer paid \`total\` + \`tip\`, and the payware fee applies to the whole of it. The response, the callback and the transaction history carry \`items\`, \`total\` and \`tip\` back. Lines change nothing about who is paid.`;

/** The `tip` parameter of a merchant's or an ISV's create tool (trData.tip, spec 24.1, D2). */
export const MERCHANT_TIP_PROPERTY = {
  type: ['string', 'number'],
  description: '💰 TRANSACTION DATA: your own tip inside amount, sent as trData.tip, e.g. "2.00": a tip the payer chose at your till before you showed the code. ' +
    'A plain decimal above 0 at the currency\'s scale, at most the amount before it, so at most half of amount (400 ERR_INVALID_TIP). ' +
    'amount is what the payer pays, tip included; items, if any, add up to amount minus tip. ' +
    'The payer\'s bank shows the tip, pays exactly amount and offers no second tip. Needs no shop setting. ' +
    'Leave it out to let the payer add a tip in their bank, where your shop allows tips.'
};

/** One paragraph for a create tool's description: the merchant's own tip and the payer's. */
export const MERCHANT_TIP_DESCRIPTION = `💁 **TIP** (\`tip\`, sent as \`trData.tip\`, optional): one tip per payment, recorded on it and never a line.
- **Yours**, for a till that asks the payer before it shows the code: \`amount\` is what the payer pays, tip included, and \`tip\` is the part that is the tip, above 0 and at most the amount before it (400 \`ERR_INVALID_TIP\`). \`items\`, if any, add up to \`amount\` minus \`tip\`. The payer's bank shows it, pays exactly \`amount\` and offers no second tip. No shop setting is needed.
- **The payer's**, without yours: where your shop allows tips (\`tipsAllowed\`, the portal's shop form), the payer may add a tip in their bank, and pays the amount plus the tip. Elsewhere the payer pays exactly the amount: there is no paying more without a tip.
- Either way it comes back as \`tip\` in the response, the callback and the transaction history, and the payware fee applies to the whole amount.`;

/**
 * The merchant's own tip as it goes on the wire, or undefined when none was given. What the server checks without the
 * payment: a plain decimal above zero, and at most the amount before it (amount - tip >= tip), else 400 ERR_INVALID_TIP.
 * Doubling is exact in binary, so 2 x tip <= amount compares the two as given.
 * @param {string|number|undefined} tip
 * @param {string|number|undefined} amount what the payer pays, tip included
 * @returns {string|undefined}
 */
export function checkMerchantTip(tip, amount) {
  if (tip === undefined || tip === null) return undefined;
  const text = String(tip).trim();
  if (!/^\d+(\.\d+)?$/.test(text) || !(Number(text) > 0)) {
    throw new Error('tip must be a plain decimal above zero at the currency\'s scale, e.g. "2.00" (payware refuses anything else with 400 ERR_INVALID_TIP)');
  }
  if (amount === undefined || amount === null || !(Number(text) * 2 <= Number(amount))) {
    throw new Error('amount is what the payer pays, tip included, and the tip is at most the amount before it, so the tip can be at most half of amount (payware refuses anything else with 400 ERR_INVALID_TIP)');
  }
  return text;
}

/**
 * The `items` array as it goes on the wire, or undefined when none were given.
 * @param {Array|undefined} items
 * @param {string|number|undefined} amount the transaction amount, which the lines must sum to
 * @returns {Array|undefined}
 * @throws {Error} naming the first thing wrong
 */
export function buildItems(items, amount) {
  if (items === undefined || items === null) return undefined;
  if (Array.isArray(items) && items.length === 0) {
    throw new Error('items is empty: send at least one line, or leave items out (payware refuses an empty list with ERR_ITEMS_EMPTY).');
  }
  if (!Array.isArray(items) || items.length > 50) {
    throw new Error('items must hold 1 to 50 lines.');
  }
  if (amount === undefined || !(Number(amount) > 0)) {
    throw new Error('items need an amount above zero: the lines must sum to it, and a payment where the payer sets the amount has none.');
  }
  return items.map((line, i) => {
    const where = `items[${i}]`;
    const type = line?.type ?? 'ITEM';
    if (type === 'TIP') {
      throw new Error(`${where}: a tip is never a line. Send your own tip as tip (trData.tip), with amount the total paid, tip included; the payer's tip, added in their bank where your shop allows tips, comes back as tip. payware refuses a TIP line with ERR_INVALID_ITEMS.`);
    }
    if (!ITEM_TYPES.includes(type)) throw new Error(`${where}: type must be one of ${ITEM_TYPES.join(', ')}.`);
    const name = typeof line.name === 'string' ? line.name : '';
    if (name.length < 1 || name.length > 100) throw new Error(`${where}: name must be 1 to 100 characters.`);
    if (/[\u0000-\u001F\u007F]/.test(name)) throw new Error(`${where}: name must not contain control characters.`);
    if (line.amount === undefined || line.amount === null || line.amount === '') throw new Error(`${where}: amount is required.`);
    const out = { type, name, amount: String(line.amount) };
    if (type === 'ITEM') {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
        throw new Error(`${where}: an ITEM line needs a whole quantity from 1 to 99.`);
      }
      if (line.unitPrice === undefined || line.unitPrice === null || line.unitPrice === '') {
        throw new Error(`${where}: an ITEM line needs unitPrice.`);
      }
      out.quantity = line.quantity;
      out.unitPrice = String(line.unitPrice);
    } else if (line.quantity !== undefined || line.unitPrice !== undefined) {
      throw new Error(`${where}: quantity and unitPrice belong on ITEM lines only.`);
    }
    if (line.country !== undefined && line.country !== null) {
      throw new Error(`${where}: a merchant line carries no country. payware sets country only on the delivery lines it prices, and refuses it here with ERR_INVALID_ITEMS.`);
    }
    return out;
  });
}
