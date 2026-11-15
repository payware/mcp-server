import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { CHANGES, READS } from '../tool-annotations.js';
import { placementsRequest } from '../placements/api.js';
import { failure, json } from '../placements/tools.js';

/**
 * Delivery settings, for a merchant and for an ISV acting for one: what delivery costs per country for
 * a shop, and which countries a product is not delivered to or costs extra in.
 *
 * Four tools, built once for either role (as shared/placements/tools.js does). The server serves them
 * on one controller, `GET`/`PUT /api/shops/{shopCode}/delivery` and
 * `GET`/`PUT /api/products/{productId}/delivery` (strategy/product/agentic-commerce-implementation-spec.md,
 * sections 4.2 and 22.7). PUT replaces the whole table; there is no per-row call.
 *
 * Credentials come from the environment only, like the placement tools: no key travels through the
 * model's context.
 */

const USE_SANDBOX = {
  type: 'boolean',
  description: 'Use the sandbox (the default) rather than production',
  default: true
};

const ROLES = {
  merchant: {
    properties: {},
    required: [],
    note: '',
    auth(args) {
      const useSandbox = args.useSandbox ?? true;
      const partnerId = getPartnerIdSafe();
      const privateKey = getPrivateKeySafe(useSandbox);
      if (!partnerId || !privateKey) {
        throw new Error('Partner credentials are not configured: set PAYWARE_PARTNER_ID and the private key path for this environment.');
      }
      return { partnerType: 'merchant', partnerId, privateKey, useSandbox };
    }
  },
  isv: {
    properties: {
      merchantPartnerId: {
        type: 'string',
        description: "The merchant you act for: its 8-character partner ID, e.g. 'PZAYNMVE'"
      },
      oauth2Token: {
        type: 'string',
        description: 'The OAuth2 access token the merchant granted you'
      }
    },
    required: ['merchantPartnerId', 'oauth2Token'],
    note: "\n\n**Acting for a merchant:** you reach only the shops the merchant assigned to you and the products in them (403 `ERR_SHOP_NOT_IN_SCOPE` for another shop, 404 `ERR_MISSING_PRODUCT` for a product outside your scope). The merchant's plan applies, not yours.",
    auth(args) {
      const useSandbox = args.useSandbox ?? true;
      const isvPartnerId = getPartnerIdSafe();
      const privateKey = getPrivateKeySafe(useSandbox);
      if (!isvPartnerId || !privateKey) {
        throw new Error('ISV credentials are not configured: set PAYWARE_PARTNER_ID and the private key path for this environment.');
      }
      return {
        partnerType: 'isv', isvPartnerId, privateKey, useSandbox,
        merchantPartnerId: args.merchantPartnerId, oauth2Token: args.oauth2Token
      };
    }
  }
};

const enc = encodeURIComponent;

const SHOP_CODE = {
  type: 'string',
  description: 'The shop code, from payware_shops_list',
  maxLength: 10
};
const PRODUCT_ID = {
  type: 'string',
  description: "The product's ID: pr + 8 letters or digits, e.g. pr7e4rCToG",
  pattern: '^pr[0-9A-Za-z]{8}$'
};
const COUNTRY = {
  type: 'string',
  description: 'ISO 3166-1 alpha-2 code, e.g. BG (accepted in any case, returned upper case)',
  pattern: '^[A-Za-z]{2}$'
};
const MONEY = '^\\d+(\\.\\d+)?$';

const PLAN_NOTE = 'Needs a plan that can ship: Standard or Premium. A Basic (BSC) merchant is refused with 403 `ERR_METHOD_NOT_ALLOWED_FOR_CURRENT_USER_PLAN`. Changes are audit-logged.';

const SHOP_ROW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    country: COUNTRY,
    currency: { type: 'string', pattern: '^[A-Z]{3}$', description: 'ISO 4217 currency of this row, e.g. EUR. A product is delivered only where its own currency has a row' },
    fee: { type: 'string', pattern: MONEY, description: 'Delivery fee as a decimal string at the currency\'s payable scale, e.g. "5.00". 0 is free delivery' },
    freeAbove: { type: 'string', pattern: MONEY, description: 'Optional: delivery is free when the goods total reaches this amount, e.g. "50.00". Above zero' }
  },
  required: ['country', 'currency', 'fee']
};

const PRODUCT_ROW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    country: COUNTRY,
    excluded: { type: 'boolean', description: 'true: this product is not delivered to this country (send no surchargePerUnit). false: it is, with the surcharge below' },
    surchargePerUnit: { type: 'string', pattern: MONEY, description: 'With excluded false: extra delivery cost per unit in the product\'s currency, e.g. "3.00". 0 or more' }
  },
  required: ['country', 'excluded']
};

function define(role, spec) {
  const r = ROLES[role];
  return {
    name: spec.name,
    annotations: spec.annotations,
    description: `${spec.description}${r.note}`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...r.properties, ...spec.properties, useSandbox: USE_SANDBOX },
      required: [...r.required, ...spec.required]
    },
    async handler(args) {
      spec.check?.(args);
      const auth = r.auth(args);
      const result = await placementsRequest({ ...spec.request(args), auth });
      if (!result.success) {
        return failure(spec.name, result);
      }
      const content = json(spec.title, result.data);
      const warning = spec.warning?.(result.data);
      return { content: warning ? [{ type: 'text', text: warning }, ...content] : content };
    }
  };
}

const SPECS = [
  {
    name: 'payware_shops_get_delivery',
    annotations: READS,
    title: 'Shop delivery settings',
    description: `Read what a shop charges for delivery, per country.

**Endpoint:** GET /shops/{shopCode}/delivery

**Warn the merchant** when the answer lists \`undeliverableProducts\` (\`productId\`, \`name\`, \`currency\`): shippable products the table has no prices for in their currency, so they cannot be delivered anywhere.

Answers \`{"shopCode":"S1","countries":[{"country":"BG","currency":"EUR","fee":"5.00","freeAbove":"50.00"}]}\`. \`freeAbove\` is optional. **An empty list means "deliver anywhere, no fee"**, which is also what a shop with no table has. With a table, only the listed countries are served and a payer or an agent buying from elsewhere gets 409 \`ERR_DELIVERY_COUNTRY_NOT_SERVED\`.

${PLAN_NOTE}`,
    properties: { shopCode: SHOP_CODE },
    required: ['shopCode'],
    request: a => ({ method: 'GET', path: `/shops/${enc(a.shopCode)}/delivery` })
  },
  {
    name: 'payware_shops_set_delivery',
    annotations: CHANGES,
    title: 'Shop delivery settings replaced',
    description: `**Replace** a shop's whole delivery table. Whatever you do not send is removed, so read it first with \`payware_shops_get_delivery\` and send every row you want to keep. An empty \`countries\` list means "deliver anywhere, no fee".

**Endpoint:** PUT /shops/{shopCode}/delivery

Each row: \`country\` (ISO alpha-2), \`currency\`, \`fee\` and optionally \`freeAbove\`, all amounts decimal strings at the currency's payable scale (at most 15 significant and 15 integer digits). Rules: no two rows with the same country and currency, at most 250 rows, \`fee\` 0 or more, \`freeAbove\` above zero. A refusal is 400 \`ERR_INVALID_DELIVERY_COUNTRY\`, \`ERR_INVALID_DELIVERY_SETTINGS\` or \`ERR_INVALID_AMOUNT_LENGTH\` and nothing is saved.

**Read the answer.** It is the saved table and, when the table is not empty, \`undeliverableProducts\` (also on every read of the table, until resolved) (\`productId\`, \`name\`, \`currency\`): the shop's active shippable products whose currency has no row in it, so they can now be delivered nowhere. It is absent when there are none. The table is saved either way: tell the merchant, and add rows in those currencies if that was not the intent.

${PLAN_NOTE}`,
    properties: {
      shopCode: SHOP_CODE,
      countries: {
        type: 'array',
        maxItems: 250,
        items: SHOP_ROW,
        description: 'The complete table: one row per country and currency. Empty means deliver anywhere with no fee'
      }
    },
    required: ['shopCode', 'countries'],
    request: a => ({ method: 'PUT', path: `/shops/${enc(a.shopCode)}/delivery`, body: { countries: a.countries } }),
    warning(data) {
      const none = Array.isArray(data?.undeliverableProducts) ? data.undeliverableProducts : [];
      if (none.length === 0) return undefined;
      return `⚠️ **${none.length} ${none.length === 1 ? 'product' : 'products'} can now be delivered nowhere:** the table has no row in ${none.length === 1 ? 'its' : 'their'} currency.\n` +
        none.map(p => `- ${p.name ?? p.productId} (${p.productId}, ${p.currency})`).join('\n') +
        '\n\nThe table was saved. Add rows in those currencies, or tell the merchant these products no longer ship.';
    }
  },
  {
    name: 'payware_products_get_delivery',
    annotations: READS,
    title: 'Product delivery settings',
    description: `Read a product's delivery overrides: the countries it is not delivered to and the countries where it costs extra.

**Endpoint:** GET /products/{productId}/delivery

**Warn the merchant** when the answer carries \`noDeliveryInCurrency: true\`: the product is shippable, its shop has a delivery table, and none of it is in the product's currency, so it cannot be delivered anywhere until prices in that currency are added to the shop.

Answers \`{"productId":"pr...","countries":[{"country":"RO","excluded":true},{"country":"BG","excluded":false,"surchargePerUnit":"3.00"}]}\`. The surcharge is in the product's currency (so the product's currency cannot change while it has one: \`ERR_PRODUCT_CURRENCY_HAS_SURCHARGES\`). Any surcharge makes a \`quantity\` required when an institution processes the product (\`ERR_QUANTITY_REQUIRED\`). The overrides only narrow the shop's table: a surcharge on a country the shop does not list has no effect until the shop serves it.

${PLAN_NOTE}`,
    properties: { productId: PRODUCT_ID },
    required: ['productId'],
    request: a => ({ method: 'GET', path: `/products/${enc(a.productId)}/delivery` })
  },
  {
    name: 'payware_products_set_delivery',
    annotations: CHANGES,
    title: 'Product delivery settings replaced',
    description: `**Replace** a product's delivery overrides. Whatever you do not send is removed, so read them first with \`payware_products_get_delivery\`.

**Endpoint:** PUT /products/{productId}/delivery

Each row is either \`{"country":"RO","excluded":true}\` (not delivered there; no surcharge) or \`{"country":"BG","excluded":false,"surchargePerUnit":"3.00"}\` (delivered, with an extra amount per unit in the product's currency). The product is useful here when it is shippable. Unknown product or one outside an ISV's shops: 404 \`ERR_MISSING_PRODUCT\`.

${PLAN_NOTE}`,
    properties: {
      productId: PRODUCT_ID,
      countries: {
        type: 'array',
        items: PRODUCT_ROW,
        description: 'The complete list of overrides, one row per country. Empty clears them'
      }
    },
    required: ['productId', 'countries'],
    check(a) {
      for (const row of a.countries ?? []) {
        if (row.excluded === true && row.surchargePerUnit !== undefined) {
          throw new Error(`${row.country}: an excluded country takes no surchargePerUnit.`);
        }
        if (row.excluded === false && row.surchargePerUnit === undefined) {
          throw new Error(`${row.country}: a country that is not excluded needs surchargePerUnit (send "0.00" for no surcharge).`);
        }
      }
    },
    request: a => ({ method: 'PUT', path: `/products/${enc(a.productId)}/delivery`, body: { countries: a.countries } })
  }
];

/**
 * The delivery-settings tools for a role.
 * @param {'merchant'|'isv'} role
 * @returns {Array} tool definitions
 */
export function deliveryTools(role) {
  if (!ROLES[role]) {
    throw new Error(`No delivery tools for role ${role}`);
  }
  return SPECS.map(spec => define(role, spec));
}
