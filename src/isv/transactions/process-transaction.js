import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { describeApiError } from '../../shared/api-errors.js';

/**
 * Process a PEER transaction as an ISV on behalf of a merchant.
 *
 * **This used to send `PATCH /transactions/{id}` with `{action: "CONFIRMED"|"DECLINED"}`, which is
 * wrong three times over.**
 *
 *  1. Wrong verb and operation. `PATCH` is *finalize*, not process. Processing is
 *     `POST /transactions/{transactionId}` with a full transaction request - which is what the
 *     merchant tool has always done.
 *  2. Wrong field. Finalize consumes `TransactionStatusUpdateRequest` - `status`, `statusMessage`,
 *     `currency`, `amount`, `fee`. There is no `action` field anywhere on the payware API, so the
 *     body deserialized to an empty request.
 *  3. Wrong actor. Even with the right field name, a merchant or an ISV acting for one may only
 *     send `status: CANCELLED`: `MerchantValidationService` throws `InvalidStatusException` for
 *     anything else, because confirming or declining a payment is the financial institution's
 *     decision and merchants never reach that path.
 *
 * To cancel, use `payware_operations_cancel_transaction`. To confirm or decline, you are looking for
 * the financial-institution role's `payware_operations_finalize_transaction`, which an ISV is not.
 */
export async function processTransaction({
  transactionId,
  amount,
  currency,
  reasonL1,
  reasonL2,
  account,
  friendlyName,
  shop,
  callbackUrl,
  passbackParams,
  timeToLive = 120,
  paymentMethod,
  merchantPartnerId,
  oauth2Token,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!amount) {
    throw new Error('Amount is required for processing');
  }

  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new Error('Amount must be a string or number representing currency value (e.g., "25.50" or 25.50)');
  }

  if (parseFloat(amount) <= 0) {
    throw new Error('Amount must be positive for processing');
  }

  if (!reasonL1) {
    throw new Error('reasonL1 is required (transaction grounds description)');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Same body the merchant tool builds - the on-behalf claims live in the JWT, not in the payload.
  const requestBody = {
    ...(account && { account }),
    ...(friendlyName && { friendlyName }),
    ...(shop && { shop }),
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    ...(paymentMethod && { paymentMethod }),
    trData: {
      amount: amount.toString(),
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    trOptions: {
      timeToLive
    }
  };

  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // The EXACT string the JWT hashed must be the body; anything else is ERR_INVALID_CONTENT_HASH.
  const minimizedBodyString = createMinimizedJSON(requestBody);

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.post(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json',
        'Api-Version': '1'
      },
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });

    return response.data;
  } catch (error) {
    throw describeApiError(error, 'call the payware API');
  }
}

export const processTransactionTool = {
  name: 'payware_operations_process_transaction',
  description: `Process a PEER transaction as an ISV on behalf of a merchant - the merchant scanning a customer's QR or barcode to collect payment.

**Endpoint:** POST /transactions/{transactionId}

The customer presents a transaction they created; the merchant (through you) processes it with the
amount to collect. Only ACTIVE transactions can be processed - one already processed answers **409
\`ERR_ALREADY_PROCESSED\`**, which means "already done", not "bad request".

⚠️ **This does not confirm or decline a payment.** Processing hands the transaction to the payer's
financial institution, which decides. An ISV cannot send CONFIRMED or DECLINED - the server rejects
any status other than CANCELLED from a merchant or its ISV. To cancel, use
\`payware_operations_cancel_transaction\`.

⚠️ **The MERCHANT's plan governs, not the ISV's.** An on-behalf call inherits the acting merchant's
plan, so this answers **403** when that merchant is on **Basic**. Naming a shop outside the scope the
merchant assigned you answers **403 \`ERR_SHOP_NOT_IN_SCOPE\`**.

💰 **\`amount\` is a decimal string at the currency's own scale** - not always two decimals. The fee
payware returns on the response is the value to echo back at finalize, unchanged.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId', 'amount', 'currency', 'reasonL1', 'merchantPartnerId', 'oauth2Token'],
    properties: {
      transactionId: {
        type: 'string',
        description: "The customer's transaction to process, e.g. \"pw7e4rCToG\""
      },
      amount: {
        type: 'string',
        description: 'Amount to collect, as a decimal string at the currency\'s own scale (e.g. "25.50"). Must be positive.'
      },
      currency: {
        type: 'string',
        pattern: '^[A-Z]{3}$',
        description: 'ISO 4217 currency code. Must match the transaction currency - changing it answers ERR_SPECIFYING_CURRENCY_NOT_ALLOWED.'
      },
      reasonL1: {
        type: 'string',
        description: 'Transaction grounds description (required)',
        maxLength: 100
      },
      reasonL2: {
        type: 'string',
        description: 'Transaction grounds description continuation (optional)',
        maxLength: 100
      },
      account: {
        type: 'string',
        description: 'Merchant account identifier. If omitted, determined from the merchant profile.',
        maxLength: 36
      },
      friendlyName: {
        type: 'string',
        description: 'Account holder recognizable name. If omitted, the merchant alias is used.',
        maxLength: 100
      },
      shop: {
        type: 'string',
        description: 'Shop code. If omitted, the merchant default shop is used - which may be outside your assigned scope. Find valid codes with payware_shops_list.',
        maxLength: 10
      },
      callbackUrl: {
        type: 'string',
        description: 'HTTPS URL for the status callback. Must present a publicly-trusted TLS certificate and resolve to a public address.',
        format: 'uri'
      },
      passbackParams: {
        type: 'string',
        description: 'Opaque string passed back unmodified on responses and callbacks.',
        maxLength: 200
      },
      timeToLive: {
        type: 'number',
        description: 'Processing window in seconds.',
        default: 120
      },
      paymentMethod: {
        type: 'string',
        enum: ['A2A', 'CARD_FUNDED', 'BNPL', 'INSTANT_CREDIT'],
        description: 'Payment method. A2A = direct transfer. CARD_FUNDED = card-linked account. BNPL = buy now pay later. INSTANT_CREDIT = credit line.'
      },
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the target merchant (8 alphanumeric characters)'
      },
      oauth2Token: {
        type: 'string',
        description: 'OAuth2 access token obtained from the merchant'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler(params) {
    try {
      const result = await processTransaction(params);

      return {
        content: [{
          type: 'text',
          text: `✅ **Transaction Processed** (ISV -> Merchant: ${params.merchantPartnerId})

- Transaction ID: ${result.transactionId || params.transactionId}
- Status: ${result.status || 'N/A'}
- Amount: ${result.amount ?? params.amount} ${result.currency ?? params.currency}
- Fee: ${result.fee ?? '(not reported)'}${result.fee ? ' - echo this back unchanged at finalize' : ''}
- ISV Partner: ${getPartnerIdSafe()}

**Next:** the payer's financial institution now confirms or declines. Watch for the callback, or poll
\`payware_operations_get_transaction_status\` while it is ACTIVE.

**Raw Response:**
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Transaction Processing Failed

**Error**: ${error.message}

**Processing Attempt:**
- Transaction ID: ${params.transactionId}
- Merchant Partner ID: ${params.merchantPartnerId}
- ISV Partner ID: ${getPartnerIdSafe()}`
        }]
      };
    }
  }
};
