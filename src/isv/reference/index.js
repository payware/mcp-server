import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Reference data - the enumerations a merchant registration form has to be filled in with.
 *
 * These are the values an assistant otherwise guesses at, and guessing is expensive here: a legal
 * form is jurisdiction-specific ("OOD" exists in Bulgaria and not in Spain), a business activity is
 * a numeric id rather than free text, and a currency the platform does not carry is a rejected
 * transaction rather than a rejected form. One GET each and there is nothing to guess.
 *
 * **Authenticated as the ISV itself, not on behalf of a merchant.** These are consumed while
 * building the form that creates a merchant, so there is no merchant to act for yet - the request
 * carries a plain ISV JWT with no `aud`/`sub` on-behalf claims.
 */

/** The five datasets, and what each one's query parameters mean. */
const DATASETS = {
  'legal-forms': {
    path: '/isv/reference/legal-forms',
    requires: 'jurisdictionCode',
    summary: 'Legal forms (company types) available in one jurisdiction',
    note:
      'jurisdictionCode is REQUIRED - an ISO 3166-1 alpha-2 country code such as BG, DE, ES. ' +
      'An unknown code is not an error: the server falls back to a generic jurisdiction and returns ' +
      'its list, so a typo comes back looking like a valid but oddly generic answer. Check that the ' +
      'result matches the country you meant.'
  },
  'business-activities': {
    path: '/isv/reference/business-activities',
    optional: 'languageCode',
    summary: 'Business activity categories, translated',
    note:
      'languageCode is an ISO 639-1 code (en, bg, es) and defaults to English. Only the LABELS are ' +
      'translated - the ids are stable across languages, so store the id and re-fetch labels rather ' +
      'than storing the text.'
  },
  currencies: {
    path: '/isv/reference/currencies',
    summary: 'Every currency payware supports',
    note:
      'Use this to validate a currency before sending it on a transaction or product. Note that the ' +
      'number of decimal places a currency uses is a property OF THE CURRENCY - two for EUR, none ' +
      'for JPY, more for others - and every amount on the API is formatted to it. Do not assume two.'
  },
  languages: {
    path: '/isv/reference/languages',
    summary: 'Languages payware supports for merchant-facing content',
    note: 'The set that languageCode accepts on the other datasets, and that a merchant can be registered in.'
  },
  jurisdictions: {
    path: '/isv/reference/jurisdictions',
    optional: 'languageCode',
    summary: 'Countries/jurisdictions where payware operates, translated',
    note:
      'Fetch this before legal-forms: it gives you the valid jurisdictionCode values, which is the ' +
      'one parameter legal-forms will silently fall back on rather than reject.'
  }
};

/**
 * Fetch one reference dataset.
 *
 * @param {Object} params
 * @param {string} params.dataset one of the keys of DATASETS
 * @param {string} [params.jurisdictionCode] required for legal-forms
 * @param {string} [params.languageCode] optional for business-activities and jurisdictions
 */
export async function getReferenceData({
  dataset,
  jurisdictionCode,
  languageCode,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  const spec = DATASETS[dataset];
  if (!spec) {
    throw new Error(
      `Unknown dataset "${dataset}". Valid datasets: ${Object.keys(DATASETS).join(', ')}`
    );
  }
  if (spec.requires === 'jurisdictionCode' && !jurisdictionCode) {
    throw new Error(
      'jurisdictionCode is required for the legal-forms dataset. Use the jurisdictions dataset to ' +
      'find valid codes - an unknown code is NOT rejected, it silently falls back to a generic list.'
    );
  }

  const query = new URLSearchParams();
  if (spec.requires === 'jurisdictionCode' || jurisdictionCode) {
    if (jurisdictionCode) query.set('jurisdictionCode', jurisdictionCode.toUpperCase());
  }
  if (spec.optional === 'languageCode' && languageCode) {
    query.set('languageCode', languageCode);
  }

  // GET, so no body and no content hash.
  const tokenData = createJWTToken(partnerId, privateKey);
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const qs = query.toString();
    const response = await axios.get(`${baseUrl}${spec.path}${qs ? `?${qs}` : ''}`, { headers });

    return {
      success: true,
      dataset,
      items: response.data,
      count: Array.isArray(response.data) ? response.data.length : 0,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

const DATASET_DOCS = Object.entries(DATASETS)
  .map(([key, spec]) => `- **\`${key}\`** - ${spec.summary}.\n  ${spec.note}`)
  .join('\n');

export const referenceDataTool = {
  name: 'payware_reference_lookup',
  description: `Look up payware reference data - the enumerations a merchant registration form needs.

**Endpoints:** GET /isv/reference/{legal-forms, business-activities, currencies, languages, jurisdictions}

One tool with a \`dataset\` parameter rather than five near-identical tools. All five are cheap,
read-only lookups, and they are used together when building a registration flow.

**Datasets**

${DATASET_DOCS}

**Authentication:** as the ISV itself. These are consumed while building the form that CREATES a
merchant, so there is no merchant to act on behalf of yet - no \`merchantPartnerId\` or
\`oauth2Token\` is involved.

**Typical order when registering a merchant:** \`jurisdictions\` -> \`legal-forms\` (with the chosen
jurisdictionCode) -> \`business-activities\` -> \`currencies\`. Store the **ids** these return, not the
translated labels; the labels change with \`languageCode\` and the ids do not.`,

  inputSchema: {
    type: 'object',
    required: ['dataset'],
    properties: {
      dataset: {
        type: 'string',
        enum: Object.keys(DATASETS),
        description: 'Which reference dataset to fetch.'
      },
      jurisdictionCode: {
        type: 'string',
        description: "ISO 3166-1 alpha-2 country code (BG, DE, ES). REQUIRED for dataset='legal-forms'. An unknown code is not rejected - the server falls back to a generic jurisdiction - so verify the result matches the country you meant.",
        pattern: '^[A-Za-z]{2}$'
      },
      languageCode: {
        type: 'string',
        description: "ISO 639-1 language code (en, bg, es) for translated labels. Applies to dataset='business-activities' and dataset='jurisdictions'; ignored otherwise. Defaults to English.",
        pattern: '^[A-Za-z]{2}$'
      },
      partnerId: {
        type: 'string',
        description: 'ISV partner ID. Uses PAYWARE_PARTNER_ID env var as default.'
      },
      privateKey: {
        type: 'string',
        description: 'RSA private key for JWT signing. Uses the environment-specific key as default.'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler(args) {
    const {
      dataset,
      jurisdictionCode,
      languageCode,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide 'partnerId' or set PAYWARE_PARTNER_ID.");
    }
    if (!privateKey) {
      throw new Error("Private key is required. Provide 'privateKey' or set PAYWARE_PRIVATE_KEY.");
    }

    const result = await getReferenceData({
      dataset, jurisdictionCode, languageCode, partnerId, privateKey, useSandbox
    });

    if (!result.success) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Reference Lookup Failed** (${dataset})

- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}
${result.error.correlationId ? `- Correlation ID: ${result.error.correlationId}` : ''}
${result.error.guidance ? `\n${result.error.guidance}` : ''}

**Timestamp:** ${result.timestamp}`
        }]
      };
    }

    const items = Array.isArray(result.items) ? result.items : [];
    // Reference rows have no single shape, so render whatever identity-ish and label-ish fields
    // each one actually has rather than assuming a schema that differs per dataset.
    const rendered = items.map(item => {
      const id = item.id ?? item.code ?? item.isoCode ?? item.currencyCode ?? item.iso31661Alpha2;
      const label = item.name ?? item.description ?? item.label ?? item.translation;
      return `- ${id !== undefined ? `\`${id}\`` : ''}${label ? ` ${label}` : ''}`.trim();
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `📚 **${dataset}** - ${result.count} item(s)${jurisdictionCode ? ` for ${jurisdictionCode.toUpperCase()}` : ''}${languageCode ? ` in ${languageCode}` : ''}

${rendered || 'No items returned.'}

${DATASETS[dataset].note}

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}`
      }]
    };
  }
};

export const isvReferenceTools = [referenceDataTool];
