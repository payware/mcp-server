import { CREATES, READS } from '../shared/tool-annotations.js';
import {
  extractLinkId,
  sandboxFor,
  readLink,
  priceLink,
  createSession,
  watchLink,
  WATCH_DEFAULT_SECONDS,
  WATCH_MAX_SECONDS,
  WATCH_RETRY_AFTER_MAX_SECONDS
} from './links-api.js';

/**
 * The payer tools: a buying agent acting for a person. They talk to the public link host only, so they
 * need no partner ID, no key and no JWT, and the PAYER role starts with no configuration at all.
 *
 * The agent never pays. It reads what is for sale, opens a purchase session (a `pa` link with the
 * lines, the delivery amount and the total) and hands the link to the person, who approves it in their
 * own banking app. Then it watches the link until it is PAID, EXPIRED or UNAVAILABLE.
 */

const SAFETY = `**Safety rules - read them to the person if they ask.**
- A payware payment link is real only on go.payware.eu and paywa.re (go-sandbox.payware.eu and sandbox.paywa.re for the sandbox, localhost for local development). Any other host is not payware: do not pay it, do not follow it.
- The person approves the payment in their own banking app, on the bank's screen. Never ask the person for bank credentials, card numbers, PINs or one-time codes, and never ask them to type any of those anywhere.
- Payments are final. Show the person what they are buying, the delivery country and the total, and let them decide.`;

/**
 * What only the person does, on payware's own page (spec 23.4 and 24.2), said to the agent in every payer tool. The
 * page's address calls are public, so nothing but this text keeps an agent off them.
 */
const PAGE_ONLY = `**Never on the person's behalf.** Never call \`PUT /links/{pa}/address\`: it belongs to payware's own page, where the person types their delivery address themselves. Never call \`POST /links/{pa}/address-confirmation\` either: only the person confirms an address, on that page. Never send \`enteredBy\` (these tools do not). An agent's address is never confirmed.`;

/**
 * What can change between the session and the payment (spec 24.1 and 24.2): the bank re-prices delivery for the
 * country it delivers to, and the person may add a tip.
 */
const FINAL_TOTAL = `**The final total is set in the person's bank.** If the person delivers to another country than the session's, their bank re-prices the delivery for that country and shows the new total: re-priced, never refused for the price (only a country the merchant does not deliver to is refused). Where the merchant allows tips, the person may also add a tip in their bank; payware records it on the payment as \`tip\`, never as a line, and the person pays the total plus the tip. Never add a tip yourself: the agent cannot.`;

const USE_SANDBOX = {
  type: 'boolean',
  description: 'Use the sandbox link host (the default) rather than production. PAYWARE_LINKS_BASE_URL, when set, overrides both (for a local server, http://localhost:8080)',
  default: true
};

const ADDRESS = {
  type: 'object',
  description: 'Where to deliver, for shippable products. Shown only to the payer\'s bank, never echoed back by payware or shown to the merchant before payment. A phone number or an email is required.',
  additionalProperties: false,
  properties: {
    fullName: { type: 'string', description: 'Recipient full name', maxLength: 200 },
    streetAddressLine1: { type: 'string', description: 'Street address line 1', maxLength: 300 },
    streetAddressLine2: { type: 'string', description: 'Street address line 2 (optional)', maxLength: 300 },
    zipCode: { type: 'string', description: 'ZIP or postal code', maxLength: 20 },
    city: { type: 'string', description: 'City', maxLength: 100 },
    region: { type: 'string', description: 'Region or state (optional: many countries have none)', maxLength: 200 },
    country: { type: 'string', description: 'ISO 3166-1 alpha-2 code, e.g. BG. The delivery amount in the session is priced for this country', pattern: '^[A-Za-z]{2}$' },
    phoneNumber: { type: 'string', description: 'Recipient phone number (required if no email)', maxLength: 255 },
    email: { type: 'string', description: 'Recipient email address (required if no phone number)', maxLength: 255 }
  },
  required: ['fullName', 'streetAddressLine1', 'zipCode', 'city', 'country']
};

const ID_PARAMETER = description => ({ type: 'string', description });

const json = data => `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

/** An error result: the status and code payware gave, and what to tell the person. */
function failed(title, result) {
  const e = result.error;
  const lines = [
    `❌ **${title} failed**`,
    '',
    `- Status: ${e.status ?? 'no response'}`,
    `- Error code: ${e.errorCode ?? 'N/A'}`,
    `- Message: ${e.message ?? 'N/A'}`,
    ...(e.correlationId ? [`- Correlation ID: ${e.correlationId}`] : [])
  ];
  if (e.status === 404) {
    lines.push('', 'Not found: the id is wrong, it has expired, sessions are switched off on that host, or this server is looking at the other environment (useSandbox, or PAYWARE_LINKS_BASE_URL).');
  }
  if (e.status === 429) {
    lines.push('', `Too many requests: wait${e.retryAfterSeconds !== undefined ? ` ${e.retryAfterSeconds} seconds` : ' a minute'} before trying again.`);
  }
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: true };
}

/**
 * The lines of a link or session as a short list for the person: name, quantity, amount, then the total. Lines on
 * the public link host carry no country (server LinkLookupService.forPage): the delivery line is labelled with the
 * session's `deliveryTo.country` or the price check's `delivery.country`.
 */
/**
 * "Delivers to 2 countries: BG 5.00, RO 12.00 EUR" from a delivery block's countries, or '' without any. A product the
 * payer prices (0.00) lists countries without amounts. Shared by the price check, the link read and the session.
 */
export function servedLine(delivery, currency) {
  const countries = Array.isArray(delivery?.countries) ? delivery.countries : [];
  if (countries.length === 0) return '';
  const priced = countries.some(c => c.amount !== undefined && c.amount !== null);
  return `\n\nDelivers to ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}: ` +
    countries.map(c => (c.amount !== undefined && c.amount !== null ? `${c.country} ${c.amount}` : c.country)).join(', ') +
    (priced ? ` ${currency ?? ''}`.trimEnd() : '');
}

function summary(link) {
  const items = Array.isArray(link?.items) ? link.items : [];
  const country = link?.deliveryTo?.country ?? link?.delivery?.country;
  const rows = items.map(item => {
    const quantity = item.quantity ? ` x ${item.quantity}` : '';
    const where = item.type === 'SHIPPING' && country ? ` (${country})` : '';
    return `- ${item.name}${where}${quantity}: ${item.amount} ${link.currency ?? ''}`.trimEnd();
  });
  const total = link?.total ? `\n**Total: ${link.total} ${link.currency ?? ''}**`.trimEnd() : '';
  return rows.length > 0 ? `${rows.join('\n')}${total}` : '';
}

export const readLinkTool = {
  name: 'payware_payer_read_link',
  annotations: READS,
  description: `Read a payware payment link: what it is for, who gets paid, the price and whether it can be paid now. Accepts a link id (pr12345678, pa12345678) or a full link (https://go.payware.eu/pr12345678, https://paywa.re/pr12345678).

**Endpoint:** GET {linksBase}/links/{id}  (public, no authentication)

**What comes back.** Always \`id\`, \`kind\` (PRODUCT, PLACEMENT, SESSION, TRANSACTION or POI), \`environment\` (PRODUCTION, SANDBOX or DEVELOPMENT), \`status\` and \`link\` (the permanent address), and the \`payee\` (\`name\`, \`tradingName\`, \`verified\`) when there is one. Statuses: AVAILABLE or UNAVAILABLE (a product, placement or session: can it be bought now), WAITING, IN_PROGRESS, PAID, NOT_PAID, EXPIRED or CANCELLED (a payment), NO_PAYMENT_WAITING (a POI with nothing to pay). An unknown id answers 404 with status UNKNOWN. \`pay\` lists the ways to pay now; it is empty once there is nothing to pay.
- A product or placement: \`amount\` and \`currency\` (or \`amountSetByPayer: true\` for a product priced 0.00, whose amount the person enters in their bank), \`productName\`, \`description\`, \`imageUrl\`, and \`deliveryDetails: true\` when the person can enter the quantity and the delivery address on payware's page. It has no lines and no delivery prices: get those for a quantity and a country with \`payware_payer_check_price\`.
- A session (pa): \`items\` and \`total\` at current prices (the delivery line shows only its amount), \`expiresAt\` and \`secondsLeft\` while it can be paid, \`lastPayment.status\` NOT_PAID after an attempt that did not pay (the person may retry from the same link), and \`deliveryTo\` when it holds an address: \`city\`, \`zipCode\`, \`country\` and \`confirmed\` only, never the name, street, phone or email. Only payment institutions read the full address, never the merchant before payment and never the public. The person may replace the address on payware's page: \`deliveryTo\` then shows their town, postcode and country, \`confirmed: false\` until they confirm it there, and the \`pa\` id stays the same, so keep watching it. While it can be paid and something is delivered, \`delivery.countries\` lists every country the merchant delivers this basket to, each with its delivery amount (absent when the merchant delivers anywhere at no charge): tell the person the delivery price for their country before they give an address. Never the address. A session never shows the payment's internal id.
- A payment or a POI's sale: \`amount\`, \`currency\`, \`reason\`, and \`expiresAt\` and \`secondsLeft\` while it waits.

**Next:** to see the price for a quantity or a delivery country without buying, \`payware_payer_check_price\`; to buy something, open a session with \`payware_payer_create_session\`; to follow a payment, \`payware_payer_watch\`.

${FINAL_TOTAL}

${SAFETY}

${PAGE_ONLY}`,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      link: ID_PARAMETER('The link id (pr12345678) or the full link (https://go.payware.eu/pr12345678). A link on a host other than go.payware.eu, paywa.re, their sandbox twins or localhost is refused'),
      useSandbox: USE_SANDBOX
    },
    required: ['link']
  },
  async handler(args) {
    const useSandbox = sandboxFor(args.link, args.useSandbox ?? true);
    const id = extractLinkId(args.link, useSandbox);
    const result = await readLink({ id, useSandbox });
    if (!result.success) return failed('Reading the link', result);
    const link = result.link;
    const short = summary(link);
    return {
      content: [{
        type: 'text',
        text: `🔗 **Link ${id}**: ${link.kind ?? 'link'}, status **${link.status ?? 'unknown'}**${short ? `\n\n${short}` : ''}${servedLine(link.delivery, link.currency)}\n\n${json(link)}`
      }]
    };
  }
};

export const checkPriceTool = {
  name: 'payware_payer_check_price',
  annotations: READS,
  description: `Price a product or placement link for a quantity and a delivery country, without opening a session and without an address. Nothing is created and nothing is paid.

**Endpoint:** GET {linksBase}/links/{prOrPlId}/price?country=BG&quantity=2  (public, no authentication)

**Use it** to show the person what one product costs delivered to their country before they decide, or to find out whether the merchant delivers there at all. It prices the link's own product only; for several products, open a session with \`payware_payer_create_session\`, which prices the whole basket.

**Returns** \`items\` (the product line and, when a country is given and served, a SHIPPING line named Delivery; lines here carry no country), \`total\` (delivery included), \`currency\`, \`quantity\` and, for a shippable product, \`delivery\`: \`country\`, \`countryServed\`, and \`countries\`, every country the merchant delivers it to with that country's delivery amount. \`countryServed: false\` means the merchant does not deliver there: tell the person; a session with that country would be refused with ERR_DELIVERY_COUNTRY_NOT_SERVED. No \`delivery\` block means the product is not shipped.

Prices are indicative until the person's bank opens the session: the bank may price delivery for its own customer's country, the person may add a tip there where the merchant allows tips, and the total shown in the bank is the one that is paid.

**Errors:** ERR_INVALID_DELIVERY_COUNTRY (use an ISO 3166-1 alpha-2 code such as BG), ERR_INVALID_QUANTITY (1 to 99), ERR_SESSION_AMOUNT_SET_BY_PAYER (a 0.00 product: the person enters the amount in their bank), 403 ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN (this merchant's plan does not ship through payware). A 404 means the product is unknown or not for sale, or sessions are switched off on that host (then the price check and opening a session answer 404, while a session already opened can still be read and paid until it expires).

${SAFETY}

${PAGE_ONLY}`,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      link: ID_PARAMETER('The product or placement link or id to price (pr12345678, pl12345678, or the full go.payware.eu link). A session (pa) already carries its price: read it instead'),
      country: { type: 'string', description: 'The delivery country to price, ISO 3166-1 alpha-2, e.g. BG. Omit to see the product price and every country the merchant delivers to', pattern: '^[A-Za-z]{2}$' },
      quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'How many of the product, 1 to 99. Default 1' },
      useSandbox: USE_SANDBOX
    },
    required: ['link']
  },
  async handler(args) {
    const useSandbox = sandboxFor(args.link, args.useSandbox ?? true);
    const id = extractLinkId(args.link, useSandbox);
    const result = await priceLink({ id, country: args.country, quantity: args.quantity, useSandbox });
    if (!result.success) return failed('Pricing the link', result);
    const price = result.price;
    const delivery = price.delivery;
    let where = '';
    if (delivery?.country) {
      where = delivery.countryServed === false
        ? `\n\n**Not delivered to ${delivery.country}.** The merchant does not deliver this product there; a session with that country would be refused.`
        : `\n\n**Delivered to ${delivery.country}.**`;
    }
    const served = servedLine(delivery, price.currency);
    const short = summary(price);
    return {
      content: [{
        type: 'text',
        text: `🏷️ **Price for ${id}**${price.quantity ? ` x ${price.quantity}` : ''}${short ? `\n\n${short}` : ''}${where}${served}\n\n` +
          'Indicative until the person\'s bank opens a session. Nothing was created.\n\n' + json(price)
      }]
    };
  }
};

export const createSessionTool = {
  name: 'payware_payer_create_session',
  annotations: CREATES,
  description: `Open a purchase session for the person: payware prices the lines and the delivery, and returns a payment link (a \`pa\` id) the person approves in their own banking app. Nothing is paid by this call.

**Endpoint:** POST {linksBase}/links/{prOrPlId}/sessions  (public, no authentication)

**Start from** a product or placement link (pr or pl), read with \`payware_payer_read_link\`. Give the lines to buy in \`lines\` (up to 20, each {productId, quantity 1-99}; the link's own product must be among them), or \`quantity\` for that one product, or neither for one unit. All lines must belong to one merchant shop and one currency. Add \`deliveryAddress\` for shippable products: the delivery amount is priced for its country, and the address is shown only to the person's bank.

**Returns** the session as \`payware_payer_read_link\` shows it: \`id\` (the pa), \`link\` (give this to the person), \`items\` (the delivery line shows only its amount), \`total\`, \`currency\`, \`expiresAt\` and \`secondsLeft\` (the session lives 24 hours), \`status\`, \`delivery.countries\` (the delivery amount for every country the merchant delivers the basket to, absent when it delivers anywhere at no charge) and, with an address, \`deliveryTo\` (town, postcode and country only). The person's bank prices the session for the country of its address; prices are indicative until the bank opens it, and if the bank's customer delivers elsewhere the bank re-prices for that country and shows the new total: re-priced, not refused, whoever gave the address. This tool never sends \`enteredBy\`: the address you give is recorded as the agent's, and the person can replace it with their own on payware's page.

**What to tell the person.** Show the items, the delivery country and the total, and give them the link. The person approves in their own banking app (a QR code on the link page works from a computer). Then call \`payware_payer_watch\` with the pa id.

**Errors you can fix:** ERR_SESSION_INVALID_LINES, ERR_SESSION_MIXED_SHOPS, ERR_SESSION_MIXED_CURRENCIES, ERR_SESSION_AMOUNT_SET_BY_PAYER (a 0.00 product cannot be in a session), ERR_SESSION_ANCHOR_NOT_IN_LINES, ERR_DELIVERY_COUNTRY_NOT_SERVED (that shop or product does not deliver there), ERR_INVALID_DELIVERY_COUNTRY (use an ISO 3166-1 alpha-2 code such as BG), ERR_INVALID_AMOUNT_LENGTH (the basket's total would exceed 15 integer or 15 significant digits). A 404 means sessions are switched off on that host (a session already opened stays readable and payable until it expires), or the id is not a product or placement. A 429 means too many sessions from here: wait as long as its Retry-After says.

${FINAL_TOTAL}

${SAFETY}

${PAGE_ONLY}`,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      link: ID_PARAMETER('The product or placement link or id to start from (pr12345678, pl12345678, or the full go.payware.eu link)'),
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        description: 'What to buy: one entry per product. Omit for a single product (use quantity). Not together with quantity',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            productId: { type: 'string', description: 'The product id, pr + 8 letters or digits' },
            quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'How many, 1 to 99' }
          },
          required: ['productId', 'quantity']
        }
      },
      quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'How many of the link\'s own product, 1 to 99. Not together with lines. Omit both for one unit' },
      deliveryAddress: ADDRESS,
      useSandbox: USE_SANDBOX
    },
    required: ['link']
  },
  async handler(args) {
    const useSandbox = sandboxFor(args.link, args.useSandbox ?? true);
    const id = extractLinkId(args.link, useSandbox);
    const result = await createSession({
      id, lines: args.lines, quantity: args.quantity, deliveryAddress: args.deliveryAddress, useSandbox
    });
    if (!result.success) return failed('Opening the session', result);
    const session = result.session;
    const short = summary(session);
    return {
      content: [{
        type: 'text',
        text: `🛒 **Session ${session.id ?? ''}** opened, status **${session.status ?? 'unknown'}**${short ? `\n\n${short}` : ''}${servedLine(session.delivery, session.currency)}\n\n` +
          `**Link for the person:** ${session.link ?? '(none returned)'}${session.expiresAt ? `\n**Expires:** ${session.expiresAt}` : ''}\n\n` +
          'The person approves in their own banking app. Follow it with `payware_payer_watch`. Nothing is paid yet.\n\n' +
          json(session)
      }]
    };
  }
};

export const watchTool = {
  name: 'payware_payer_watch',
  annotations: READS,
  description: `Follow a payment link until it is paid or can no longer be: polls the link every 3 seconds until its status is final (PAID, NOT_PAID, EXPIRED, CANCELLED or UNAVAILABLE), or the time is up, and returns the last state.

**Endpoint:** GET {linksBase}/links/{id}, repeatedly  (public, no authentication)

**Returns** the last state read and whether it is final. A time-out is not a failure: the person may simply not have approved yet; call again with the same id. Default wait ${WATCH_DEFAULT_SECONDS} seconds, at most ${WATCH_MAX_SECONDS}. Some clients cut a tool call that runs long: if yours does, use a shorter timeoutSeconds and call again. A 429 from the link host is waited out as its Retry-After says (at most ${WATCH_RETRY_AFTER_MAX_SECONDS} s per wait); when that would pass the time limit, the watch stops and says how long to wait.

**Statuses.** AVAILABLE (not opened yet), WAITING or IN_PROGRESS (the person's bank has it), PAID (done, the money has moved), UNAVAILABLE (a line went off sale: nothing to pay now), EXPIRED (not paid in time: nothing was charged), and on a payment link NOT_PAID (declined or failed) or CANCELLED. A session is never NOT_PAID itself: after an attempt that did not pay it is AVAILABLE again with \`lastPayment.status\` NOT_PAID, the person may retry from the same link, and the watch goes on.

${FINAL_TOTAL}

${SAFETY}

${PAGE_ONLY}`,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      link: ID_PARAMETER('The session id (pa12345678) or its full link, from payware_payer_create_session'),
      timeoutSeconds: {
        type: 'integer',
        minimum: 1,
        maximum: WATCH_MAX_SECONDS,
        description: `How long to wait, in seconds. Default ${WATCH_DEFAULT_SECONDS}, maximum ${WATCH_MAX_SECONDS}`,
        default: WATCH_DEFAULT_SECONDS
      },
      useSandbox: USE_SANDBOX
    },
    required: ['link']
  },
  async handler(args) {
    const useSandbox = sandboxFor(args.link, args.useSandbox ?? true);
    const id = extractLinkId(args.link, useSandbox);
    const result = await watchLink({ id, timeoutSeconds: args.timeoutSeconds, useSandbox });
    if (!result.success) {
      return failed('Watching the link', { error: result.lastError });
    }
    const link = result.link ?? {};
    const headline = result.final
      ? `**${link.status}**`
      : `**${link.status ?? 'no answer yet'}** (not final: stopped after ${result.elapsedSeconds} s and ${result.polls} reads, the person has not finished)`;
    const retry = link.lastPayment?.status === 'NOT_PAID'
      ? ' The last attempt did not pay (declined, failed or cancelled in the bank); the person may try again from the same link.'
      : '';
    const advice = {
      PAID: 'The payment is done. Tell the person it went through.',
      NOT_PAID: 'The payment was declined or failed and nothing was charged. The person may start again if they still want it.',
      CANCELLED: 'The payment was cancelled and nothing was charged.',
      EXPIRED: 'Not paid in time and nothing was charged. Open a new session if the person still wants it.',
      UNAVAILABLE: 'Something in the basket went off sale, so it cannot be paid. Read the link again and offer what is left.'
    }[link.status] ?? `Call payware_payer_watch again with the same link to keep waiting.${retry}`;
    const limited = result.lastError?.status === 429
      ? `\n\nThe link host is limiting requests from here: wait${result.lastError.retryAfterSeconds !== undefined ? ` ${result.lastError.retryAfterSeconds} seconds` : ' a minute'} before watching again.`
      : '';
    const short = summary(link);
    return {
      content: [{
        type: 'text',
        text: `⏱️ **Link ${id}**: ${headline}${short ? `\n\n${short}` : ''}\n\n${advice}` +
          `${result.lastError ? `\n\nThe last read failed (${result.lastError.status ?? 'no response'}): ${result.lastError.message}` : ''}${limited}\n\n${json(link)}`
      }]
    };
  }
};

export const payerTools = [readLinkTool, checkPriceTool, createSessionTool, watchTool];
