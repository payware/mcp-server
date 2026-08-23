import axios from 'axios';
import { createAuthHeaders } from '../auth-headers.js';
import { apiErrorResult } from '../api-errors.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';

/**
 * Creating POIs (Points of Interaction) - the physical payment points a payer scans.
 *
 * The existing POI tools could list, read, price and un-price a POI but not create one, so a fleet
 * had to be built by hand in the portal before any of them were usable. `POST /poi` and
 * `POST /poi/batch` close that: batch is the one a terminal rollout actually needs, since it creates
 * up to 50 in a single atomic call.
 */

/** The server's cap, from POIService.MAX_BATCH_SIZE. Exceeding it is ERR_BATCH_TOO_LARGE. */
export const MAX_POI_BATCH_SIZE = 50;

/** TTL bounds the server validates on both create paths. */
export const POI_TTL_MIN_SECONDS = 60;
export const POI_TTL_MAX_SECONDS = 600;

function validateTtl(ttlSeconds, label = 'ttlSeconds') {
  if (ttlSeconds === undefined || ttlSeconds === null) return;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < POI_TTL_MIN_SECONDS || ttlSeconds > POI_TTL_MAX_SECONDS) {
    throw new Error(
      `${label} must be a whole number of seconds between ${POI_TTL_MIN_SECONDS} and ${POI_TTL_MAX_SECONDS}`
    );
  }
}

/**
 * Create a single POI.
 *
 * @param {Object} params
 * @param {string} params.partnerType  'merchant' | 'isv'
 * @param {string} params.shopCode     required - the outlet this POI belongs to
 * @param {string} [params.name]       max 100 chars
 * @param {number} [params.ttlSeconds] 60-600, server default 300
 * @param {string} [params.callbackUrl]
 */
export async function createPOI({
  partnerType,
  shopCode,
  name,
  ttlSeconds,
  callbackUrl,
  useSandbox = true,
  ...authParams
}) {
  if (!shopCode) {
    throw new Error('shopCode is required - use payware_shops_list to find a valid one');
  }
  if (name !== undefined && String(name).length > 100) {
    throw new Error('POI name must not exceed 100 characters');
  }
  validateTtl(ttlSeconds);

  const requestBody = {
    shopCode,
    ...(name && { name }),
    ...(ttlSeconds !== undefined && ttlSeconds !== null && { ttlSeconds }),
    ...(callbackUrl && { callbackUrl })
  };

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.post(`${baseUrl}/poi`, minimizedBody, {
      headers,
      transformRequest: [(data) => data]
    });

    return {
      success: true,
      poi: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Create up to 50 POIs in one atomic call.
 *
 * `shopCode`, `ttlSeconds` and `callbackUrl` set at the top level are the defaults for every entry;
 * an entry may override `name`, `ttlSeconds` and `callbackUrl` for itself.
 */
export async function createPOIBatch({
  partnerType,
  shopCode,
  pois,
  ttlSeconds,
  callbackUrl,
  useSandbox = true,
  ...authParams
}) {
  if (!shopCode) {
    throw new Error('shopCode is required - use payware_shops_list to find a valid one');
  }
  if (!Array.isArray(pois) || pois.length === 0) {
    // Matches the server's ERR_BATCH_EMPTY, refused here so the round trip is not wasted.
    throw new Error('pois must be a non-empty array (server: ERR_BATCH_EMPTY)');
  }
  if (pois.length > MAX_POI_BATCH_SIZE) {
    throw new Error(
      `pois must contain at most ${MAX_POI_BATCH_SIZE} entries (server: ERR_BATCH_TOO_LARGE). ` +
      `Received ${pois.length} - split the rollout into batches of ${MAX_POI_BATCH_SIZE}.`
    );
  }
  validateTtl(ttlSeconds);
  pois.forEach((poi, i) => {
    if (poi?.name !== undefined && String(poi.name).length > 100) {
      throw new Error(`pois[${i}].name must not exceed 100 characters`);
    }
    validateTtl(poi?.ttlSeconds, `pois[${i}].ttlSeconds`);
  });

  const requestBody = {
    shopCode,
    ...(ttlSeconds !== undefined && ttlSeconds !== null && { ttlSeconds }),
    ...(callbackUrl && { callbackUrl }),
    pois: pois.map(poi => ({
      ...(poi.name && { name: poi.name }),
      ...(poi.ttlSeconds !== undefined && poi.ttlSeconds !== null && { ttlSeconds: poi.ttlSeconds }),
      ...(poi.callbackUrl && { callbackUrl: poi.callbackUrl })
    }))
  };

  const minimizedBody = createMinimizedJSON(requestBody);
  const headers = await createAuthHeaders(partnerType, { ...authParams, requestBody: minimizedBody });

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.post(`${baseUrl}/poi/batch`, minimizedBody, {
      headers,
      transformRequest: [(data) => data]
    });

    return {
      success: true,
      created: response.data?.created ?? 0,
      pois: response.data?.pois ?? [],
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

const SHARED_POI_NOTES = `
**A POI belongs to a shop, and a shop belongs to a merchant.** \`shopCode\` is required - use
\`payware_shops_list\` to find one rather than guessing. Banks do not own POIs; a financial-institution
principal gets 403 on every POI endpoint, not an empty result.

**\`ttlSeconds\` is the price-session TTL, not the POI's lifetime.** It bounds how long a price set on
this POI stays claimable before the POI returns to IDLE. Range ${POI_TTL_MIN_SECONDS}-${POI_TTL_MAX_SECONDS} seconds; the server
defaults it to 300.`;

function errorText(title, result) {
  return `❌ **${title}**

- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}
${result.error.correlationId ? `- Correlation ID: ${result.error.correlationId}` : ''}
${result.error.guidance ? `\n${result.error.guidance}` : ''}

**Timestamp:** ${result.timestamp}`;
}

function isvAuthProperties() {
  return {
    merchantPartnerId: {
      type: 'string',
      description: 'Partner ID of the target merchant (8 alphanumeric characters)'
    },
    oauth2Token: {
      type: 'string',
      description: 'OAuth2 access token obtained from the merchant'
    }
  };
}

function merchantAuthProperties() {
  return {
    partnerId: {
      type: 'string',
      description: 'Partner ID from the payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.'
    },
    privateKey: {
      type: 'string',
      description: 'RSA private key for JWT signing. Uses the environment-specific key as default.'
    }
  };
}

/** Build the single-POI create tool for a role. */
export function buildCreatePOITool({ partnerType, resolveAuth }) {
  const isIsv = partnerType === 'isv';

  return {
    name: 'payware_poi_create',
    description: `Create a single POI (Point of Interaction) - a physical payment point a payer scans.

**Endpoint:** POST /poi -> 201 Created
${SHARED_POI_NOTES}

**Creating many at once?** Use \`payware_poi_create_batch\` instead. It creates up to ${MAX_POI_BATCH_SIZE} in one
atomic call, which is both faster and safer than a loop over this tool: a loop that fails halfway
leaves a half-built estate with no record of where it stopped.
${isIsv ? `
⚠️ **ISV scope and plan.** The shop must be in the scope this merchant assigned you, or the call is
**403 \`ERR_SHOP_NOT_IN_SCOPE\`**. The acting merchant's plan governs, not yours.
` : ''}`,

    inputSchema: {
      type: 'object',
      required: isIsv ? ['merchantPartnerId', 'oauth2Token', 'shopCode'] : ['shopCode'],
      properties: {
        ...(isIsv ? isvAuthProperties() : merchantAuthProperties()),
        shopCode: {
          type: 'string',
          description: 'Code of the shop this POI belongs to. Required. Find one with payware_shops_list.'
        },
        name: {
          type: 'string',
          description: 'Human-readable POI name, e.g. "Till 3" or "Gate B". Shown in the portal and in POI listings.',
          maxLength: 100
        },
        ttlSeconds: {
          type: 'integer',
          description: `Price-session TTL in seconds - how long a price set on this POI stays claimable before it returns to IDLE. Server default 300.`,
          minimum: POI_TTL_MIN_SECONDS,
          maximum: POI_TTL_MAX_SECONDS
        },
        callbackUrl: {
          type: 'string',
          description: 'HTTPS URL for POI events. Must present a publicly-trusted TLS certificate and resolve to a public address.',
          format: 'uri'
        },
        useSandbox: {
          type: 'boolean',
          description: 'Use sandbox environment for testing',
          default: true
        }
      }
    },

    async handler(args) {
      const { shopCode, name, ttlSeconds, callbackUrl, useSandbox = true } = args;
      const result = await createPOI({
        partnerType,
        shopCode,
        name,
        ttlSeconds,
        callbackUrl,
        useSandbox,
        ...resolveAuth(args)
      });

      if (!result.success) {
        return { content: [{ type: 'text', text: errorText('Failed to Create POI', result) }] };
      }

      const poi = result.poi || {};
      return {
        content: [{
          type: 'text',
          text: `✅ **POI Created**

- POI ID: \`${poi.poiId}\`
- Name: ${poi.name || '(unnamed)'}
- Shop: ${poi.shopName || poi.shopCode || shopCode}
- Status: ${poi.status || 'IDLE'}

**Next:** set a price with \`payware_poi_set_price\`, or fetch its QR code with
\`payware_poi_get_qrcode\` to print and mount at the payment point.

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  };
}

/** Build the batch-create tool for a role. */
export function buildCreatePOIBatchTool({ partnerType, resolveAuth }) {
  const isIsv = partnerType === 'isv';

  return {
    name: 'payware_poi_create_batch',
    description: `Create up to ${MAX_POI_BATCH_SIZE} POIs in a single **atomic** call - the tool for rolling out a terminal estate.

**Endpoint:** POST /poi/batch -> 201 Created, returning \`{ created, pois: [...] }\`

**Atomic means all or nothing.** Either every entry is created or none is. That is the reason to
prefer this over a loop of \`payware_poi_create\`: a loop that fails on entry 27 leaves 26 POIs behind
with nothing recording where it stopped, and re-running it duplicates them.
${SHARED_POI_NOTES}

**Defaults and overrides.** \`shopCode\`, \`ttlSeconds\` and \`callbackUrl\` at the top level apply to
every entry. An entry may override \`name\`, \`ttlSeconds\` and \`callbackUrl\` for itself. \`shopCode\` is
top-level only - one batch builds one shop.

**Limits:** 1 to ${MAX_POI_BATCH_SIZE} entries. An empty list is \`ERR_BATCH_EMPTY\`; more than ${MAX_POI_BATCH_SIZE} is
\`ERR_BATCH_TOO_LARGE\`. Both are refused locally before the request is sent. For a larger rollout,
split it into batches of ${MAX_POI_BATCH_SIZE} - each batch is atomic on its own, so record which batches succeeded.
${isIsv ? `
⚠️ **ISV scope and plan.** The shop must be in the scope this merchant assigned you, or the whole
batch is **403 \`ERR_SHOP_NOT_IN_SCOPE\`**. The acting merchant's plan governs, not yours.
` : ''}`,

    inputSchema: {
      type: 'object',
      required: isIsv ? ['merchantPartnerId', 'oauth2Token', 'shopCode', 'pois'] : ['shopCode', 'pois'],
      properties: {
        ...(isIsv ? isvAuthProperties() : merchantAuthProperties()),
        shopCode: {
          type: 'string',
          description: 'Code of the shop every POI in this batch belongs to. Required, top-level only. Find one with payware_shops_list.'
        },
        pois: {
          type: 'array',
          description: `The POIs to create. Each entry may set name, ttlSeconds and callbackUrl; anything omitted falls back to the top-level value. An entry may be an empty object, which creates an unnamed POI with the batch defaults.`,
          minItems: 1,
          maxItems: MAX_POI_BATCH_SIZE,
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Human-readable POI name, e.g. "Till 3".',
                maxLength: 100
              },
              ttlSeconds: {
                type: 'integer',
                description: 'Overrides the batch ttlSeconds for this POI.',
                minimum: POI_TTL_MIN_SECONDS,
                maximum: POI_TTL_MAX_SECONDS
              },
              callbackUrl: {
                type: 'string',
                description: 'Overrides the batch callbackUrl for this POI.',
                format: 'uri'
              }
            }
          }
        },
        ttlSeconds: {
          type: 'integer',
          description: 'Default price-session TTL for every POI in the batch. Server default 300.',
          minimum: POI_TTL_MIN_SECONDS,
          maximum: POI_TTL_MAX_SECONDS
        },
        callbackUrl: {
          type: 'string',
          description: 'Default HTTPS callback URL for every POI in the batch.',
          format: 'uri'
        },
        useSandbox: {
          type: 'boolean',
          description: 'Use sandbox environment for testing',
          default: true
        }
      }
    },

    async handler(args) {
      const { shopCode, pois, ttlSeconds, callbackUrl, useSandbox = true } = args;
      const result = await createPOIBatch({
        partnerType,
        shopCode,
        pois,
        ttlSeconds,
        callbackUrl,
        useSandbox,
        ...resolveAuth(args)
      });

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `${errorText('Failed to Create POI Batch', result)}

**Nothing was created.** The call is atomic, so a failure leaves no partial estate behind - fix the
cause and re-send the same batch.`
          }]
        };
      }

      const created = result.pois.map(poi =>
        `- \`${poi.poiId}\` ${poi.name || '(unnamed)'} - ${poi.status || 'IDLE'}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `✅ **POI Batch Created** - ${result.created} POI(s) in shop \`${shopCode}\`

${created}

**Next:** fetch each QR code with \`payware_poi_get_qrcode\` to print and mount, then set prices with
\`payware_poi_set_price\` as sales happen.

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
        }]
      };
    }
  };
}
