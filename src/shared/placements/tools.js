import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { ADDS, CHANGES, CREATES, READS } from '../tool-annotations.js';
import { placementsRequest } from './api.js';

/**
 * Campaigns, placements and airings, for a merchant and for an ISV acting for one.
 *
 * One definition per tool, built for either role by `placementTools(role)`. The two roles differ only
 * in how they authenticate and in what an ISV may see, so writing each of the 22 tools twice, as the
 * older product modules do, would be 22 chances for the copies to drift. The server routes are on
 * branch feature/placements: CampaignController, PlacementController, AiringController and
 * PlacementCalendarController; tests/tool-routes.test.js pins each tool to its route.
 *
 * Credentials come from the environment only. Unlike the older tools these take no `partnerId` or
 * `privateKey` argument: a key passed as an argument travels through the model's context.
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
    note: "\n\n**Acting for a merchant:** you see and manage the campaigns you created and the merchant's campaigns that hold placements in your shops, and only placements of products in your shops. The merchant's plan applies, not yours.",
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

// --- Parameters ----------------------------------------------------------------------------------

const PRODUCT_ID = {
  type: 'string',
  description: "The product's ID: pr + 8 letters or digits, e.g. pr7e4rCToG",
  pattern: '^pr[0-9A-Za-z]{8}$'
};
const PLACEMENT_ID = {
  type: 'string',
  description: "The placement's ID: pl + 8 letters or digits, e.g. pl7e4rCToG",
  pattern: '^pl[0-9A-Za-z]{8}$'
};
const CAMPAIGN_ID = {
  type: 'string',
  description: "The campaign's ID: cp + 8 letters or digits, e.g. cp7e4rCToG",
  pattern: '^cp[0-9A-Za-z]{8}$'
};
const RULE_ID = {
  type: 'integer',
  description: "The airing rule's ID, from payware_products_list_airings",
  minimum: 1
};
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const RANGE_FORMS = 'a date (YYYY-MM-DD, the start of that day in UTC) or an ISO-8601 instant with an offset, e.g. 2026-10-19T00:00:00+03:00';

const STATS_RANGE = {
  from: { type: 'string', description: `Start of the period: ${RANGE_FORMS}. Default: 30 days before to` },
  to: { type: 'string', description: `End of the period, exclusive, in the same forms. Default: now. At most 400 days after from` }
};

const CAMPAIGN_FIELDS = {
  name: { type: 'string', description: 'Campaign name, up to 100 characters', maxLength: 100 },
  startsOn: { ...DATE, description: 'First day, YYYY-MM-DD' },
  endsOn: { ...DATE, description: 'Last day, YYYY-MM-DD' },
  status: {
    type: 'string',
    enum: ['DRAFT', 'ACTIVE', 'ENDED'],
    description: 'Descriptive only: it does not switch the placements on or off'
  },
  externalRef: { type: 'string', description: "An agency's own campaign code, up to 100 characters", maxLength: 100 }
};

const MEDIA = ['PRINT', 'PACKAGING', 'OUTDOOR', 'IN_STORE', 'EVENT', 'TV', 'RADIO', 'STREAMING', 'ONLINE', 'SOCIAL', 'EMAIL', 'SMS', 'OTHER'];
const CARRIERS = ['QR', 'BARCODE', 'NFC', 'BLE', 'LINK', 'SMS', 'SOUNDBITE'];

const PLACEMENT_FIELDS = {
  name: { type: 'string', description: 'Placement name, up to 100 characters, e.g. "Sofia metro posters, October"', maxLength: 100 },
  campaignId: { ...CAMPAIGN_ID, description: 'The campaign it belongs to, if any (cp + 8 characters)' },
  medium: { type: 'string', enum: MEDIA, description: 'What the placement is' },
  carriers: {
    type: 'array',
    items: { type: 'string', enum: CARRIERS },
    minItems: 1,
    maxItems: 7,
    description: 'The methods that carry the placement ID to a payer. SOUNDBITE airs the product\'s audio and needs airing rules'
  },
  channel: { type: 'string', description: 'Descriptive, e.g. the TV channel or the website, up to 100 characters', maxLength: 100 },
  location: { type: 'string', description: 'Descriptive, e.g. the venue or the address, up to 255 characters', maxLength: 255 },
  externalRef: { type: 'string', description: "An agency's own code, up to 100 characters", maxLength: 100 },
  regions: {
    type: 'array',
    items: { type: 'string', pattern: '^[A-Z]{2}$' },
    description: "ISO 3166-1 alpha-2 codes of the countries it airs in, matched against the paying bank's country. Empty means anywhere"
  },
  active: {
    type: 'boolean',
    description: 'Whether it is in use. Governs airing and soundbite attribution; a printed code keeps resolving until the placement is deleted'
  },
  activeFrom: { type: 'string', description: "Start of its active window, ISO-8601 with an offset. Empty means the product's" },
  activeTo: { type: 'string', description: "End of its active window, ISO-8601 with an offset. Empty means the product's" }
};

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const AIRING_RULE_FIELDS = {
  frequency: { type: 'string', enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'], description: 'How the rule repeats' },
  repeatEvery: { type: 'integer', minimum: 1, maximum: 366, description: 'Every N days, weeks or months. Default 1' },
  startDate: { ...DATE, description: 'First day, YYYY-MM-DD, in the rule\'s time zone' },
  endDate: { ...DATE, description: 'Last day, YYYY-MM-DD, at most 366 days after startDate. Omit for open-ended' },
  timeZone: { type: 'string', description: "IANA time zone, e.g. Europe/Sofia. Default: the product's" },
  daysOfWeek: { type: 'array', items: { type: 'string', enum: WEEKDAYS }, description: 'WEEKLY: the days it airs on' },
  monthDays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 31 },
    description: 'MONTHLY by date: days of the month. A day a month lacks is skipped'
  },
  monthWeek: { type: 'integer', enum: [1, 2, 3, 4, 5, -1], description: 'MONTHLY by weekday: which week, -1 for the last. Use with monthWeekday' },
  monthWeekday: { type: 'string', enum: WEEKDAYS, description: 'MONTHLY by weekday: the weekday' },
  windows: {
    type: 'array',
    minItems: 1,
    maxItems: 24,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: 'HH:mm' },
        end: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: 'HH:mm, at most 6 hours after start. At or before start runs past midnight' }
      },
      required: ['start', 'end']
    },
    description: 'Time windows on each day it airs, local to the time zone: 1 to 24, each up to 6 hours'
  },
  excludedDates: { type: 'array', items: { ...DATE }, description: 'Days it does not air, YYYY-MM-DD' },
  expectedAudience: { type: 'integer', minimum: 0, description: 'Expected audience per airing, for your own planning' }
};

const AIRING_RULE = {
  type: 'object',
  additionalProperties: false,
  properties: AIRING_RULE_FIELDS,
  required: ['frequency', 'startDate', 'windows']
};

// --- Building blocks -----------------------------------------------------------------------------

const enc = encodeURIComponent;

/** The arguments named in `fields` that were given, as a request body. */
function pick(args, fields) {
  return Object.fromEntries(Object.keys(fields).filter(k => args[k] !== undefined).map(k => [k, args[k]]));
}

function json(title, data) {
  return [{ type: 'text', text: `**${title}**\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }];
}

function failure(toolName, result) {
  const e = result.error;
  const rows = Array.isArray(e.details?.rows) && e.details.rows.length > 0
    ? `\n\n**Refused rules (nothing was saved):**\n${e.details.rows.map(r => `- #${r.index}: ${r.errorCode} - ${r.message}`).join('\n')}`
    : '';
  const lines = [
    `**${toolName} failed**`,
    '',
    `- Status: ${e.status ?? 'no response'}`,
    `- Error code: ${e.errorCode ?? 'N/A'}`,
    `- Message: ${e.message ?? 'N/A'}`,
    ...(e.correlationId ? [`- Correlation ID: ${e.correlationId} (quote it to payware support)`] : []),
    ...(e.guidance ? ['', e.guidance] : [])
  ];
  return { content: [{ type: 'text', text: lines.join('\n') + rows }], isError: true };
}

/** A placement image as MCP image content, or as text when it is SVG or not an image at all. */
function image(placementId, result) {
  const type = String(result.contentType || '').split(';')[0].trim();
  const bytes = Buffer.from(result.data);
  if (type === 'image/png' || type === 'image/jpeg') {
    return [
      { type: 'image', data: bytes.toString('base64'), mimeType: type },
      { type: 'text', text: `Image of placement ${placementId}: ${type}, ${bytes.length} bytes.` }
    ];
  }
  return [{ type: 'text', text: `**Image of placement ${placementId}** (${type || 'unknown type'}, ${bytes.length} bytes)\n\n${bytes.toString('utf8')}` }];
}

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
      required: [...r.required, ...(spec.required ?? [])]
    },
    async handler(args) {
      const auth = r.auth(args);
      const result = await placementsRequest({ ...spec.request(args), auth });
      if (!result.success) {
        return failure(spec.name, result);
      }
      return { content: spec.present ? spec.present(result, args) : json(spec.title, result.data) };
    }
  };
}

// --- The tools -----------------------------------------------------------------------------------

const PLAN_NOTE = 'Changing anything here needs the PRM plan, and below it a change answers 403 ERR_UNAUTHORIZED_OPERATION; reading works on every plan, results only on PRM. A merchant that leaves PRM keeps its placements read-only, and a printed placement code then pays as its plain product with no attribution.';

const SPECS = [
  // Campaigns: /campaigns
  {
    name: 'payware_campaigns_list_campaigns',
    annotations: READS,
    title: 'Campaigns',
    description: `List the merchant's campaigns. A campaign groups placements, possibly of different products, and reports their combined results.\n\n**Endpoint:** GET /campaigns\n\n${PLAN_NOTE}`,
    properties: {},
    request: () => ({ method: 'GET', path: '/campaigns' })
  },
  {
    name: 'payware_campaigns_create_campaign',
    annotations: CREATES,
    title: 'Campaign created',
    description: 'Create a campaign. Attach placements to it by giving its campaignId when you create or replace a placement.\n\n**Endpoint:** POST /campaigns (PRM plan)',
    properties: CAMPAIGN_FIELDS,
    required: ['name'],
    request: (a) => ({ method: 'POST', path: '/campaigns', body: pick(a, CAMPAIGN_FIELDS) })
  },
  {
    name: 'payware_campaigns_get_campaign',
    annotations: READS,
    title: 'Campaign',
    description: 'Get a campaign, with the IDs of its placements you can see.\n\n**Endpoint:** GET /campaigns/{campaignId}',
    properties: { campaignId: CAMPAIGN_ID },
    required: ['campaignId'],
    request: (a) => ({ method: 'GET', path: `/campaigns/${enc(a.campaignId)}` })
  },
  {
    name: 'payware_campaigns_update_campaign',
    annotations: CHANGES,
    title: 'Campaign replaced',
    description: '**Replace** a campaign\'s details. An omitted startsOn, endsOn or externalRef is cleared; an omitted status keeps the current one. Get the campaign first and send every value you want to keep.\n\n**Endpoint:** PUT /campaigns/{campaignId} (PRM plan)',
    properties: { campaignId: CAMPAIGN_ID, ...CAMPAIGN_FIELDS },
    required: ['campaignId', 'name'],
    request: (a) => ({ method: 'PUT', path: `/campaigns/${enc(a.campaignId)}`, body: pick(a, CAMPAIGN_FIELDS) })
  },
  {
    name: 'payware_campaigns_delete_campaign',
    annotations: CHANGES,
    title: 'Campaign deleted',
    description: 'Delete a campaign. Its placements stay, detached from it, and keep working.\n\n**Endpoint:** DELETE /campaigns/{campaignId} (PRM plan)',
    properties: { campaignId: CAMPAIGN_ID },
    required: ['campaignId'],
    request: (a) => ({ method: 'DELETE', path: `/campaigns/${enc(a.campaignId)}` }),
    present: (r, a) => [{ type: 'text', text: `Campaign ${a.campaignId} deleted. Its placements are detached and keep working.` }]
  },
  {
    name: 'payware_campaigns_get_campaign_stats',
    annotations: READS,
    title: 'Campaign results',
    description: 'A campaign\'s results over [from, to): offers shown when a bank resolved one of its placement IDs (resolutions), offers shown after a recognised soundbite tap (recognitions), payments started (transactions) and confirmed, and confirmed amounts by currency.\n\n**Endpoint:** GET /campaigns/{campaignId}/stats (PRM plan)',
    properties: { campaignId: CAMPAIGN_ID, ...STATS_RANGE },
    required: ['campaignId'],
    request: (a) => ({ method: 'GET', path: `/campaigns/${enc(a.campaignId)}/stats`, query: { from: a.from, to: a.to } })
  },

  // Placements: /products/{productId}/placements
  {
    name: 'payware_products_list_placements',
    annotations: READS,
    title: 'Placements',
    description: `List a product's placements. A placement is one way the product is distributed - a poster, a TV spot, a packaging label - with its own ID (pl + 8 characters), so every payment it starts is attributed to it.\n\n**Endpoint:** GET /products/{productId}/placements\n\n${PLAN_NOTE}`,
    properties: { productId: PRODUCT_ID },
    required: ['productId'],
    request: (a) => ({ method: 'GET', path: `/products/${enc(a.productId)}/placements` })
  },
  {
    name: 'payware_products_create_placement',
    annotations: CREATES,
    title: 'Placement created',
    description: 'Create a placement for a product; up to 1,000 per product. The response carries its placementId, which goes on the medium wherever the product ID would: a QR code (payware://{placementId}), an NFC tag, a BLE beacon, a link, a barcode or an SMS. A bank resolving it pays for the product, and the payment is attributed to the placement. For a SOUNDBITE carrier, add airing rules so taps during the airing are attributed.\n\n**Endpoint:** POST /products/{productId}/placements (PRM plan)',
    properties: { productId: PRODUCT_ID, ...PLACEMENT_FIELDS },
    required: ['productId', 'name', 'medium', 'carriers'],
    request: (a) => ({ method: 'POST', path: `/products/${enc(a.productId)}/placements`, body: pick(a, PLACEMENT_FIELDS) })
  },
  {
    name: 'payware_products_get_placement',
    annotations: READS,
    title: 'Placement',
    description: 'Get a placement.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID },
    required: ['productId', 'placementId'],
    request: (a) => ({ method: 'GET', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}` })
  },
  {
    name: 'payware_products_update_placement',
    annotations: CHANGES,
    title: 'Placement replaced',
    description: '**Replace** a placement\'s details. Every field is replaced, so an omitted optional field is cleared - an omitted campaignId detaches it from its campaign; an omitted active keeps the current value. Get the placement first and send every value you want to keep. The placement ID does not change, so printed codes keep working.\n\n**Endpoint:** PUT /products/{productId}/placements/{placementId} (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ...PLACEMENT_FIELDS },
    required: ['productId', 'placementId', 'name', 'medium', 'carriers'],
    request: (a) => ({
      method: 'PUT',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}`,
      body: pick(a, PLACEMENT_FIELDS)
    })
  },
  {
    name: 'payware_products_delete_placement',
    annotations: CHANGES,
    title: 'Placement deleted',
    description: 'Delete a placement. **Its printed codes stop resolving**, its short link is retired and its ID is never reused. To stop airing and attribution but keep printed codes working, replace it with active false instead.\n\n**Endpoint:** DELETE /products/{productId}/placements/{placementId} (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID },
    required: ['productId', 'placementId'],
    request: (a) => ({ method: 'DELETE', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}` }),
    present: (r, a) => [{ type: 'text', text: `Placement ${a.placementId} deleted. Its codes no longer resolve and its short link is retired.` }]
  },
  {
    name: 'payware_products_get_placement_image',
    annotations: READS,
    title: 'Placement image',
    description: 'A placement\'s QR code (carrying payware://{placementId}) or Code 128 barcode (carrying the plain ID), for print. PNG and JPG come back as an image, SVG as its markup.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/image',
    properties: {
      productId: PRODUCT_ID,
      placementId: PLACEMENT_ID,
      type: { type: 'string', enum: ['QR', 'BARCODE'], description: 'QR code or barcode. Default QR', default: 'QR' },
      format: { type: 'string', enum: ['PNG', 'JPG', 'SVG'], description: 'Image format. Default PNG', default: 'PNG' }
    },
    required: ['productId', 'placementId'],
    request: (a) => ({
      method: 'GET',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/image`,
      query: { type: a.type ?? 'QR', format: a.format ?? 'PNG' },
      binary: true
    }),
    present: (r, a) => image(a.placementId, r)
  },
  {
    name: 'payware_products_get_placement_link',
    annotations: ADDS,
    title: 'Placement link',
    description: 'A placement\'s short link, https://go.payware.eu/{placementId}, made on the first request and the same afterwards. On a phone it opens payware:/{placementId} in the payment app; a payment through it is attributed to the placement.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/link (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID },
    required: ['productId', 'placementId'],
    request: (a) => ({ method: 'GET', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/link` }),
    present: (r, a) => [{
      type: 'text',
      text: `Short link of placement ${a.placementId}:\n\n${typeof r.data === 'string' ? r.data : JSON.stringify(r.data)}`
    }]
  },
  {
    name: 'payware_products_get_placement_stats',
    annotations: READS,
    title: 'Placement results',
    description: 'A placement\'s results over [from, to): offers shown when a bank resolved its ID (resolutions), offers shown after a recognised soundbite tap (recognitions), payments started (transactions) and confirmed, and confirmed amounts by currency.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/stats (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ...STATS_RANGE },
    required: ['productId', 'placementId'],
    request: (a) => ({
      method: 'GET',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/stats`,
      query: { from: a.from, to: a.to }
    })
  },

  // Airings: /products/{productId}/placements/{placementId}/airings, and /placements/calendar
  {
    name: 'payware_products_list_airings',
    annotations: READS,
    title: 'Airing rules',
    description: 'List a placement\'s airing rules. A rule is a recurrence with time windows, in an IANA time zone; a soundbite tap during an airing is attributed to the placement.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/airings',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID },
    required: ['productId', 'placementId'],
    request: (a) => ({ method: 'GET', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings` })
  },
  {
    name: 'payware_products_create_airing',
    annotations: CREATES,
    title: 'Airing rule added',
    description: 'Add an airing rule to a placement: up to 100 rules per placement. Example: "daily 08:00-08:30 and 15:40-16:10" is one DAILY rule with two windows. Check `warnings` in the response: AIRING_OVERLAP means another soundbite placement of the same product airs at the same time in an overlapping region, and a tap then is attributed to neither.\n\n**Endpoint:** POST /products/{productId}/placements/{placementId}/airings (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ...AIRING_RULE_FIELDS },
    required: ['productId', 'placementId', 'frequency', 'startDate', 'windows'],
    request: (a) => ({
      method: 'POST',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings`,
      body: pick(a, AIRING_RULE_FIELDS)
    })
  },
  {
    name: 'payware_products_replace_airings',
    annotations: CHANGES,
    title: 'Airing rules replaced',
    description: '**Replace all** of a placement\'s airing rules with this list, all or nothing: when any rule is refused, nothing is saved and each refused rule is listed by its index. An empty list removes every rule. Suited to loading an agency\'s schedule in one call.\n\n**Endpoint:** PUT /products/{productId}/placements/{placementId}/airings (PRM plan)',
    properties: {
      productId: PRODUCT_ID,
      placementId: PLACEMENT_ID,
      rules: { type: 'array', maxItems: 100, items: AIRING_RULE, description: 'The complete new set of airing rules, up to 100' }
    },
    required: ['productId', 'placementId', 'rules'],
    request: (a) => ({
      method: 'PUT',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings`,
      body: a.rules
    })
  },
  {
    name: 'payware_products_get_next_airings',
    annotations: READS,
    title: 'Next airings',
    description: 'A placement\'s next airings, each in its rule\'s time zone so daylight-saving shifts are visible. Use it to check a rule does what was meant before relying on it.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/airings/next',
    properties: {
      productId: PRODUCT_ID,
      placementId: PLACEMENT_ID,
      count: { type: 'integer', minimum: 1, maximum: 100, description: 'How many, 1 to 100. Default 10' }
    },
    required: ['productId', 'placementId'],
    request: (a) => ({
      method: 'GET',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings/next`,
      query: { count: a.count }
    })
  },
  {
    name: 'payware_products_get_airing',
    annotations: READS,
    title: 'Airing rule',
    description: 'Get one airing rule.\n\n**Endpoint:** GET /products/{productId}/placements/{placementId}/airings/{ruleId}',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ruleId: RULE_ID },
    required: ['productId', 'placementId', 'ruleId'],
    request: (a) => ({ method: 'GET', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings/${enc(a.ruleId)}` })
  },
  {
    name: 'payware_products_update_airing',
    annotations: CHANGES,
    title: 'Airing rule replaced',
    description: '**Replace** one airing rule: every field is replaced, so send the whole rule. Check `warnings` in the response for AIRING_OVERLAP.\n\n**Endpoint:** PUT /products/{productId}/placements/{placementId}/airings/{ruleId} (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ruleId: RULE_ID, ...AIRING_RULE_FIELDS },
    required: ['productId', 'placementId', 'ruleId', 'frequency', 'startDate', 'windows'],
    request: (a) => ({
      method: 'PUT',
      path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings/${enc(a.ruleId)}`,
      body: pick(a, AIRING_RULE_FIELDS)
    })
  },
  {
    name: 'payware_products_delete_airing',
    annotations: CHANGES,
    title: 'Airing rule deleted',
    description: 'Delete one airing rule.\n\n**Endpoint:** DELETE /products/{productId}/placements/{placementId}/airings/{ruleId} (PRM plan)',
    properties: { productId: PRODUCT_ID, placementId: PLACEMENT_ID, ruleId: RULE_ID },
    required: ['productId', 'placementId', 'ruleId'],
    request: (a) => ({ method: 'DELETE', path: `/products/${enc(a.productId)}/placements/${enc(a.placementId)}/airings/${enc(a.ruleId)}` }),
    present: (r, a) => [{ type: 'text', text: `Airing rule ${a.ruleId} of placement ${a.placementId} deleted.` }]
  },
  {
    name: 'payware_products_get_airing_calendar',
    annotations: READS,
    title: 'Airing calendar',
    description: 'Every airing of the merchant\'s placements between from and to, across all products, ordered by start time and each in its rule\'s time zone. Answers "what is on air this week" in one call. The range may span at most 400 days.\n\n**Endpoint:** GET /placements/calendar',
    properties: {
      from: { type: 'string', description: `Start of the range: ${RANGE_FORMS}` },
      to: { type: 'string', description: 'End of the range, after from, in the same forms' }
    },
    required: ['from', 'to'],
    request: (a) => ({ method: 'GET', path: '/placements/calendar', query: { from: a.from, to: a.to } })
  }
];

/**
 * The campaign, placement and airing tools for a role.
 * @param {'merchant'|'isv'} role
 * @returns {Array} tool definitions
 */
export function placementTools(role) {
  if (!ROLES[role]) {
    throw new Error(`No placement tools for role ${role}`);
  }
  return SPECS.map(spec => define(role, spec));
}
