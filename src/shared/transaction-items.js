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
 */

export const ITEM_TYPES = ['ITEM', 'SHIPPING', 'DISCOUNT', 'TAX', 'SURCHARGE'];

const AMOUNT = '^-?\\d+(\\.\\d+)?$';

/** The `items` parameter of a create tool. */
export const ITEMS_PROPERTY = {
  type: 'array',
  minItems: 1,
  maxItems: 50,
  description:
    'Optional lines the payer\'s bank shows, 1 to 50, e.g. [{"type":"ITEM","name":"Vase","quantity":2,"unitPrice":"40.00","amount":"80.00"},{"type":"SHIPPING","name":"Delivery","amount":"5.00"}]. ' +
    'The lines must sum EXACTLY to amount (400 ERR_ITEMS_DO_NOT_SUM otherwise; anything else malformed is 400 ERR_INVALID_ITEMS; an empty list is 400 ERR_ITEMS_EMPTY: send at least one line or leave items out). ' +
    'ITEM: quantity 1-99, unitPrice 0 or more, amount = quantity x unitPrice. DISCOUNT: amount below 0. Every other type: amount 0 or more. ' +
    'Amounts are decimal strings at the currency\'s payable scale, at most 15 significant and 15 integer digits. Needs an amount above zero. No images, product ids or country here: payware sets country only on the delivery lines it prices.',
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
export const ITEMS_DESCRIPTION = `🧾 **LINES** (\`items\`, root level, optional): what the payer's bank shows instead of one amount - items with quantity and unit price, delivery, discounts, taxes. 1-50 lines that sum exactly to \`trData.amount\` (400 \`ERR_ITEMS_DO_NOT_SUM\`); malformed lines, or a line with a \`country\` (payware sets it only on delivery lines it prices), are 400 \`ERR_INVALID_ITEMS\`; an empty list is 400 \`ERR_ITEMS_EMPTY\` (leave \`items\` out instead). Not for an amount of 0. A payment with lines is paid exactly its total (409 \`ERR_AMOUNT_NOT_TOTAL\` for anything else, so no tip). The response, the callback and the transaction history carry \`items\` and \`total\` back. Lines change nothing about the fee or who is paid.`;

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
