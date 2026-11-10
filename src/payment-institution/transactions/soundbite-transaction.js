import axios from 'axios';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSoundbiteUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';

/**
 * Soundbite recognition: an audio fingerprint from the payware soundbite SDK, answered with the product
 * it matches.
 *
 * Recognition has its own host (kb financial-institution/api, "Host and connection";
 * server TransactionController.SOUNDBITE_DESCRIPTION): https://soundbite.payware.eu/api/transactions,
 * sandbox https://soundbite-sandbox.payware.eu. The API hosts refuse it with 421 ERR_SOUNDBITE_HOST, which
 * is what this tool got on every call while it posted to them. A multipart body carries no content hash.
 *
 * Answers: 200 with the product (and `recognition`) on a match, 200 with an empty body when nothing was
 * recognised (keep listening), 503 ERR_RECOGNITION_BUSY with Retry-After at capacity.
 *
 * @param {Object} params
 * @returns {Object} { success, matched, transaction, requestId } or apiErrorResult
 */
export async function getSoundbiteTransaction({
  filePath,
  soundbiteSession,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!filePath) {
    throw new Error('filePath is required for soundbite recognition');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  let fileBuffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch (error) {
    throw new Error(`Failed to read soundbite file: ${error.message}`);
  }

  // Node 18's own FormData and Blob; axios sets the multipart Content-Type with its boundary.
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'application/octet-stream' }), basename(filePath));

  const tokenData = createJWTToken(partnerId, privateKey, null);
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Api-Version': '1',
    ...(soundbiteSession && { 'Soundbite-Session': soundbiteSession })
  };

  try {
    const response = await axios.post(`${getSoundbiteUrl(useSandbox)}/transactions`, form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    const data = response.data;
    const matched = data !== null && data !== undefined && data !== '' && typeof data === 'object';

    return {
      success: true,
      matched,
      transaction: matched ? data : null,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Soundbite recognition tool implementation
 */
export const soundbiteTransactionTool = {
  name: "payware_operations_soundbite_transaction",
  // A lookup: it names a product and creates no payment (the payment is made by processing the id it
  // returns). It is a POST only because it carries a file.
  annotations: READS,
  description: `Recognise a soundbite: upload an audio fingerprint from the payware soundbite SDK and get back the product it matches, as a payment institution.

**Host:** recognition is answered only at https://soundbite.payware.eu (sandbox https://soundbite-sandbox.payware.eu), \`POST /api/transactions\` with multipart/form-data, part \`file\`. The API hosts refuse it with 421 ERR_SOUNDBITE_HOST. Every other call, including processing what recognition returns, goes to the API host.

**Answers:**
- A match: the product (transactionId, amount, currency, product details), so the app can show the payment review screen. With \`recognition.confidence\` PROBABLE, ask the shopper "Is this the ad?" and report the answer, with \`recognition.id\`, to \`POST /api/transactions/recognitions/{id}\` on the soundbite host (no tool for it here). CERTAIN, or no \`recognition\`, is a certain answer.
- No match: an empty body. Nothing was recognised (or the product is inactive): keep listening.
- 503 ERR_RECOGNITION_BUSY: recognition is at capacity. Keep the recording and send it again after the Retry-After seconds.

**Then:** process the returned transactionId with \`payware_operations_process_transaction\` on the API host, and finalize the pw transaction that processing returns.

**Soundbite-Session:** optionally one random UUID per tap, the same on every query of that tap, so its answers keep one id.

The JWT carries no contentSha256 (a multipart upload has none).`,
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Absolute path to the fingerprint file the payware soundbite SDK wrote"
      },
      soundbiteSession: {
        type: "string",
        description: "Optional Soundbite-Session header: one random UUID per tap, the same on every query of that tap. Ignored by the server when malformed.",
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default."
      },
      useSandbox: {
        type: "boolean",
        description: "Use the sandbox soundbite host (default) or production's",
        default: true
      }
    },
    required: ["filePath"]
  },

  async handler(args) {
    const useSandbox = args.useSandbox ?? true;
    const {
      filePath,
      soundbiteSession,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(useSandbox)
    } = args;

    if (!filePath) {
      throw new Error("filePath is required for soundbite recognition");
    }
    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }
    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(useSandbox)}.`);
    }

    const result = await getSoundbiteTransaction({ filePath, soundbiteSession, partnerId, privateKey, useSandbox });
    const endpoint = `POST ${getSoundbiteUrl(useSandbox)}/transactions (multipart/form-data)`;

    if (result.success && !result.matched) {
      return {
        content: [{
          type: "text",
          text: `🔇 **Nothing recognised**

The soundbite host answered with an empty body: the fingerprint matched no active product. Keep listening and send the next fingerprint.

- Endpoint: ${endpoint}
- Correlation ID: ${result.requestId || 'N/A'}`
        }]
      };
    }

    if (result.success) {
      const tx = result.transaction;
      const probable = tx.recognition?.confidence === 'PROBABLE';
      return {
        content: [{
          type: "text",
          text: `🔊 **Soundbite recognised**

- Transaction ID: ${tx.transactionId || 'N/A'}
- Amount: ${tx.amount ?? 'N/A'} ${tx.currency || ''}
- Reason: ${tx.reasonL1 || 'N/A'}${tx.reasonL2 ? ` (${tx.reasonL2})` : ''}
- Payee: ${tx.payeeFriendlyName || 'N/A'}
${tx.recognition ? `- Recognition: ${tx.recognition.confidence}${tx.recognition.id ? ` (id ${tx.recognition.id})` : ''}` : '- Recognition: certain'}

${probable ? `**PROBABLE:** ask the shopper "Is this the ad?" before paying, and report the answer to \`POST /api/transactions/recognitions/${tx.recognition.id}\` on the soundbite host.\n\n` : ''}**Response:**
\`\`\`json
${JSON.stringify(tx, null, 2)}
\`\`\`

**Next steps:**
1. Process \`${tx.transactionId || 'the transactionId'}\` with \`payware_operations_process_transaction\` (on the API host)
2. Finalize the pw transaction that processing returns with \`payware_operations_finalize_transaction\`: EXECUTING immediately before money moves, then CONFIRMED once the Merchant Leg has completed, or FAILED (DECLINED if the payer declines before the lock)

- Endpoint: ${endpoint}
- Correlation ID: ${result.requestId || 'N/A'}`
        }]
      };
    }

    const busy = result.error.errorCode === 'ERR_RECOGNITION_BUSY';
    return {
      content: [{
        type: "text",
        text: `❌ **Soundbite recognition failed**

- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.errorCode || 'N/A'}
- Message: ${result.error.message}
${result.error.retryAfterSeconds !== undefined ? `- Retry-After: ${result.error.retryAfterSeconds} seconds\n` : ''}- Endpoint: ${endpoint}

${busy ? '**Recognition is at capacity.** Keep the recording and send it again after the Retry-After seconds; the window was not evaluated.'
  : result.error.errorCode === 'ERR_SOUNDBITE_HOST' ? '**Sent to an API host.** Recognition is answered only at the soundbite host; check PAYWARE_SOUNDBITE_SANDBOX_URL / PAYWARE_SOUNDBITE_PRODUCTION_URL.'
    : 'Check the file is a fingerprint the payware soundbite SDK wrote, and that your institution is active.'}

\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\``
      }]
    };
  }
};
