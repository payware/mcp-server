import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { COMMITS } from '../../shared/tool-annotations.js';

/** Product, placement and soundbite codes: the server takes reasonL1 from the product when it is omitted. */
const PRODUCT_CODE = /^(pr|pl|ps)/;

/**
 * What the server refuses on every institution process, said before the call. The amount: the server
 * defaults an absent one to 0.00 and refuses anything not above zero (FIValidationService
 * .validateAmountGreaterThanZero, ERR_INVALID_AMOUNT), so it is required. reasonL1: required too, except
 * for a product, placement or soundbite code (TransactionControllerService fills it from the product).
 */
export function checkProcessArgs({ transactionId, amount, reasonL1 }) {
  if (amount === undefined || amount === null || amount === '' || !(Number(amount) > 0)) {
    throw new Error('amount is required and must be above zero: the server refuses a process without one (ERR_INVALID_AMOUNT)');
  }
  if (!reasonL1 && !PRODUCT_CODE.test(String(transactionId))) {
    throw new Error('reasonL1 is required, except for a product (pr), placement (pl) or soundbite (ps) code, whose reason the server takes from the product');
  }
}

/**
 * The payer's tip (trData.tip, spec 24.1: one tip rule for every payment), checked before the call: a plain decimal
 * above zero, and at most half of amount (amount is the amount asked + tip, and the tip is at most the amount asked).
 * Any id may carry it, with or without lines. What needs the payment itself is the server's: whether the read said
 * tipsAllowed (the shop allows tips, a fixed amount, no tip yet; 409 ERR_TIPS_NOT_ALLOWED), the currency's scale and the
 * tip against the amount asked (400 ERR_INVALID_TIP), and amount = asked + tip (409 ERR_AMOUNT_NOT_TOTAL). Doubling is
 * exact in binary, so 2 x tip <= amount compares the two as given.
 * @returns {string|undefined} the tip as it goes on the wire, or undefined when none was given
 */
export function checkTip({ tip, amount }) {
  if (tip === undefined || tip === null) return undefined;
  const text = String(tip).trim();
  if (!/^\d+(\.\d+)?$/.test(text) || !(Number(text) > 0)) {
    throw new Error('tip must be a plain decimal above zero at the currency\'s scale, e.g. "2.00" (payware refuses anything else with 400 ERR_INVALID_TIP)');
  }
  if (!(Number(text) * 2 <= Number(amount))) {
    throw new Error('with a tip, amount is the amount asked plus the tip, and the tip is at most the amount asked, so the tip can be at most half of amount (payware answers 409 ERR_AMOUNT_NOT_TOTAL, or 400 ERR_INVALID_TIP for a tip above the amount asked)');
  }
  return text;
}

/**
 * Process a transaction as a payment institution via payware API
 * Payment institutions can process transactions they didn't create
 * @param {Object} params - Transaction processing parameters
 * @returns {Object} Transaction processing response
 */
export async function processPITransaction({
  transactionId,
  account,
  friendlyName,
  amount,
  currency,
  reasonL1,
  reasonL2,
  callbackUrl,
  passbackParams,
  timeToLive,
  partnerId,
  privateKey,
  // Delivery address for SHIPPABLE transactions
  deliveryAddress,
  // A pa paid with the payer's page-confirmed address: the read's delivery.addressVersion (review C4)
  deliveryAddressVersion,
  // Units of a product, placement or soundbite id (trData.quantity): payware then builds the lines
  quantity,
  // The payer's tip (trData.tip, spec 24.1): payware records it on the payment, never as a line
  tip,
  // Payment method for POI transactions (Payment Choice Architecture)
  paymentMethod,
  idempotencyKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  // No account check here: the server requires one only from the payee's institution, that is for a
  // transaction its payer created (FIValidationService.accountIsPayees). The payer's institution sends
  // none - payware does not keep the payer's account, and one that is sent is ignored.

  if (!friendlyName) {
    throw new Error('friendlyName is required for payment institutions');
  }

  if (!currency) {
    throw new Error('currency is required for payment institutions');
  }

  checkProcessArgs({ transactionId, amount, reasonL1 });
  const tipText = checkTip({ tip, amount });

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Build request body according to payment institution API documentation
  const requestBody = {
    ...(account && { account }),
    friendlyName,
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    ...(paymentMethod && { paymentMethod }),
    trData: {
      amount: amount.toString(),
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 }),
      ...(quantity !== undefined && { quantity }),
      ...(tipText !== undefined && { tip: tipText })
    },
    ...(timeToLive && {
      trOptions: {
        timeToLive
      }
    }),
    ...(deliveryAddress && { deliveryAddress }),
    ...(deliveryAddressVersion && { deliveryAddressVersion })
  };

  // Convert to deterministic minimized JSON for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (POST requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1', // Required: current API version
    ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const response = await axios.post(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
      headers,
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });

    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-correlation-id'],
      replayed: response.headers?.['idempotent-replayed'] === 'true',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * Process payment institution transaction tool implementation
 */
export const processPITransactionTool = {
  name: "payware_operations_process_transaction",
  annotations: COMMITS,
  description: `Process a transaction as a payment institution. Payment institutions can process transactions created by others and must provide friendlyName, and account when processing as the payee.

**Use Cases:**
- **As Payer (SRC)**: Process a transaction initiated by payee (pay a request)
- **As Payee (DST)**: Process a transaction initiated by payer (accept payment)
- **Cross-PI**: Process transactions from other payment institutions

**Required for Payment Institutions:**
- friendlyName: Your account holder name
- account: the account the money is paid into, only when processing as the payee (a transaction its payer created, role SRC; otherwise 400 ERR_MISSING_PARTNER_ACCOUNT). As the payer's institution leave it out: payware does not keep the payer's account, and one that is sent is ignored
- currency: Transaction currency (required)
- amount: above zero (required: the server refuses a process without one)
- reasonL1: required, except for a product, placement or soundbite code, whose reason the server takes from the product

**Lines, quantity and delivery (\`pr\`, \`pl\`, \`ps\` and \`pa\`).** Read the offer first (\`payware_operations_get_transaction_status\`, or \`payware_fi_quote\` to re-price): it carries \`items\` and \`total\`. Then:
- \`quantity\` (sent as \`trData.quantity\`, 1-99, pr/pl/ps only; ignored for a \`pa\`) makes payware build the lines for that quantity and for \`deliveryAddress.country\`. **\`amount\` must then equal the offer's \`total\` exactly** (plus your \`tip\`, if you send one), else 409 \`ERR_AMOUNT_NOT_TOTAL\` (re-read, show the payer the new total). \`quantity\` is required (400 \`ERR_QUANTITY_REQUIRED\`) for a shippable product whose shop has a delivery table or that has a delivery surcharge. Without it no lines are stored and \`amount\` is exactly the sale price, plus your \`tip\` where the read shows \`tipsAllowed: true\` (it used to be "at least the sale price"; paying more without a tip is gone). A shippable product priced 0.00 (the payer sets the amount) still needs a country the shop and product serve (409 \`ERR_DELIVERY_COUNTRY_NOT_SERVED\`); no delivery amount is added.
- \`deliveryAddress.country\` is an ISO 3166-1 alpha-2 code, e.g. BG (400 \`ERR_INVALID_DELIVERY_COUNTRY\` otherwise). A country the shop or product does not serve is 409 \`ERR_DELIVERY_COUNTRY_NOT_SERVED\`. Every check runs before the transaction is created.
- A \`pa\` id (an agent purchase session): \`amount\` = its \`total\` (plus your \`tip\`, if you send one) and the \`reasonL1\` you read (this tool requires it for a pa). \`deliveryAddress\` is optional when the read shows \`delivery.addressConfirmed: true\` for an address the payer entered and confirmed on payware's page (the payer may also replace an agent's address there with their own): leave it out, send \`deliveryAddressVersion\` with the read's \`delivery.addressVersion\`, and payware uses the session's address, stores it on the payment and the merchant gets it as usual. Anyone holding the link can change that address on payware's page, so a missing or older version is 409 \`ERR_SESSION_ADDRESS_CHANGED\` (a repeat of the same call needs it too): read the session again, show the payer where the goods go and let them approve again. An agent's own address never stands in for yours, even confirmed: send your own \`deliveryAddress\` for it. Without a confirmed address, a shippable session needs \`deliveryAddress\` (400 \`ERR_MISSING_DELIVERY_ADDRESS\` otherwise). **A \`deliveryAddress\` in another country than the session's is re-priced, never refused for its price**, whoever entered the session's address: payware prices delivery for your payer's country, so re-read with \`payware_fi_quote\` for that country and send that total as \`amount\` (a country the shop or product does not serve is still 409 \`ERR_DELIVERY_COUNTRY_NOT_SERVED\`). A bank that cannot capture addresses opens \`https://{link host}/{id}?delivery\` in the browser instead of processing: for a \`pr\` or \`pl\` offer whose read carries \`deliveryDetails: true\` (only then does the page have the form), and for a shippable \`pa\` without a confirmed address, where the payer enters their own. It then processes the \`pa\` the payer returns with (\`payware:{pa}\`, the same id for a session) without an address. The response is the processed \`pw\` with \`items\` and \`total\`: finalize that pw id.

**Amount and tip: one rule for every payment (spec 24.1).** Every payment that asks an amount (a \`pw\` with or without lines, an offer with or without \`quantity\`, a \`pa\`, a \`pi\`, a P2P request) is paid **exactly** the amount it asks: \`amount\` on a merchant's payment (\`pw\`, with or without lines; with lines it equals \`total\` plus the merchant's own \`tip\` when the read carries one) or a POI sale (\`pi\`), \`total\` on an offer or a session (\`pr\`, \`pl\`, \`ps\`, \`pa\`). More without a tip is 409 \`ERR_AMOUNT_NOT_TOTAL\`, less 400 \`ERR_INVALID_AMOUNT\`: there is no paying more without a tip. Only a payer-set amount (a 0.00 product, a \`pw\` of 0.00) is typed by the payer, and it takes no tip.

**Tip (\`tip\`, sent as \`trData.tip\`).** Where the read shows \`tipsAllowed: true\` (the merchant allows tips for the shop, the payment asks a fixed amount, carries no tip yet and nobody has processed it), with or without lines. A plain decimal at the currency's scale, above 0 and at most the amount asked (400 \`ERR_INVALID_TIP\` otherwise). **\`amount\` must then be exactly the amount asked + tip** (409 \`ERR_AMOUNT_NOT_TOTAL\`). Without \`tipsAllowed\` (a shop that takes no tips, P2P, a payer-set amount, or a payment that already carries the merchant's own \`tip\`, which is inside \`amount\`) a tip answers 409 \`ERR_TIPS_NOT_ALLOWED\`. payware records the tip on the payment, never as a line, in the same write that processes it, so it is fixed before EXECUTING; reads, the finalize answer and the merchant's callback carry it as \`tip\`, beside \`items\` and \`total\`, which stay what was sold. The payware fee applies to the whole amount, tip included: echo the process response's \`fee\` at EXECUTING as always, and send EXECUTING with exactly the \`amount\` you processed. A repeat must carry the same tip: any other body is refused with 409, as any different body is.

**After processing (as the payer's institution):** take the payer's single approval of both transfers and reserve the amount, then finalize in two calls with \`payware_operations_finalize_transaction\`: EXECUTING immediately before money moves (payware checks everything and locks; a refusal means nothing moves), execute the Merchant Leg, and CONFIRMED only once it has completed (or FAILED). The Fee Leg follows CONFIRMED for every transfer type; for DEFERRED keep the Fee Amount reserved on the payer's account until then. Once your institution has sent EXECUTING, the transaction shows as EXECUTING to your institution only; the merchant still sees ACTIVE.

**\`deferredAllowed\` in the response.** Present, and \`true\`, only when the merchant opted this transaction in to a deferred Merchant Leg. Only then may EXECUTING carry \`transferType: DEFERRED\` (an ordinary credit transfer that settles later); otherwise it is refused with ERR_DEFERRED_TRANSFER_NOT_ALLOWED. Absent means instant or internal only.

**API Request Structure:**
\`\`\`json
{
  "friendlyName": "Jane Doe",
  "callbackUrl": "https://callback.url",
  "passbackParams": "internal-ref-123",
  "trData": {
    "amount": "57.60",
    "currency": "EUR",
    "reasonL1": "Bill payment",
    "reasonL2": "Invoice #12345"
  },
  "trOptions": {
    "timeToLive": 300
  }
}
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      idempotencyKey: {
        type: "string",
        description: "Optional. Sent as the Idempotency-Key header. Use one value per payment (a UUID is typical) and the same value on every retry of it: a retry with the same key and body within 24 hours returns the transaction the first call created instead of a new one, and the result reports replayed: true. The same key with a different body is refused (422 ERR_IDEMPOTENCY_KEY_REUSED); a retry while the first call still runs gets 409 ERR_IDEMPOTENCY_KEY_IN_PROGRESS.",
        pattern: "^[\\x21-\\x7E]{1,255}$"
      },
      transactionId: {
        type: "string",
        description: "The id the payer scanned: 'pw' (a transaction), 'pr' (product), 'pl' (placement: pays as its product, and the payment is attributed to the placement), 'ps' (soundbite), 'pi' (a POI with a price set) or 'pa' (an agent purchase session). A product, placement, soundbite, POI or session id creates the pw transaction the response returns; finalize that pw id. Up to 32 characters: identifiers may grow beyond today's 10.",
        pattern: "^(pw|pr|pl|ps|pi|pa)[0-9A-Za-z]{8,30}$"
      },
      quantity: {
        type: "integer",
        description: "Units to buy, sent as trData.quantity (1-99), for a pr, pl or ps id; ignored for a pa. When sent, payware builds the lines and amount must equal the offer's total, plus tip if you send one (409 ERR_AMOUNT_NOT_TOTAL). Without it amount is exactly the sale price (plus tip). Required (400 ERR_QUANTITY_REQUIRED) for a shippable product whose shop has a delivery table or that has a delivery surcharge.",
        minimum: 1,
        maximum: 99
      },
      tip: {
        type: ["string", "number"],
        description: "The payer's tip, sent as trData.tip: a plain decimal at the currency's scale, e.g. \"2.00\", above 0 and at most the amount asked (400 ERR_INVALID_TIP). Only where the read shows tipsAllowed: true, with or without lines (any pw, pr, pl, ps, pa or pi); otherwise 409 ERR_TIPS_NOT_ALLOWED. amount must then be exactly the amount asked + tip (409 ERR_AMOUNT_NOT_TOTAL). payware records it on the payment, never as a line, and the fee applies to the whole amount. A repeat must carry the same tip.",
        pattern: "^\\d+(\\.\\d+)?$"
      },
      account: {
        type: "string",
        description: "The account the money is paid into. Required only when processing as the payee, a transaction its payer created (role SRC); 400 ERR_MISSING_PARTNER_ACCOUNT without it. Leave it out as the payer's institution: payware does not keep the payer's account, and one that is sent is ignored.",
        maxLength: 36
      },
      friendlyName: {
        type: "string",
        description: "Your account holder recognizable name (required for payment institutions)",
        maxLength: 100
      },
      amount: {
        type: ["number", "string"],
        description: "Amount to process, above zero (required: the server refuses a process without one, ERR_INVALID_AMOUNT). As the payer: exactly the amount the payment asks (its total when it has lines, else its amount), or that + tip when you send tip; more is 409 ERR_AMOUNT_NOT_TOTAL, less 400 ERR_INVALID_AMOUNT. Only a payer-set amount (0.00) is typed freely. As the payee: at most what the payer offered. EXECUTING then carries exactly this amount. At most 15 significant and 15 integer digits (400 ERR_INVALID_AMOUNT_LENGTH).",
        minimum: 0.01,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency (ISO 3-character code, required for payment institutions)"
      },
      reasonL1: {
        type: "string",
        description: "Transaction grounds description. Required for a pw or pi id; for a product, placement or soundbite code the server takes it from the product when omitted (for a SHIPPABLE product, the merchant and shop name).",
        maxLength: 100
      },
      reasonL2: {
        type: "string",
        description: "Transaction grounds description continuation (optional - omit for SHIPPABLE to get product name)",
        maxLength: 100
      },
      callbackUrl: {
        type: "string",
        description: "HTTPS URL to receive transaction status callbacks (mandatory when processing as payee)",
        format: "uri"
      },
      passbackParams: {
        type: "string",
        description: "Parameters passed back through callback",
        maxLength: 200
      },
      timeToLive: {
        type: "number",
        description: "Time allowed until payware accepts EXECUTING (the execution lock), in seconds; a locked transaction no longer expires (PI can extend: 60-2592000, Merchant: original+120 max)",
        minimum: 60,
        maximum: 2592000
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
      // Payment method for POI transactions
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "How the payer pays, recorded on any transaction an institution processes (and only then: a merchant's process does not record it). A2A = account-to-account transfer. CARD_FUNDED = card-funded transfer. BNPL = buy now pay later. INSTANT_CREDIT = credit approved at purchase. Fee resolution follows it."
      },
      deliveryAddressVersion: {
        type: "string",
        description: "A purchase session (pa) paid without deliveryAddress, with the address the payer confirmed on payware's page: the delivery.addressVersion of the read you showed the payer. Required then (409 ERR_SESSION_ADDRESS_CHANGED when missing or not the current one: the address changed after your read; read again and show the payer where the goods go). Not needed when you send a deliveryAddress.",
        maxLength: 64
      },
      // Delivery address for SHIPPABLE transactions
      deliveryAddress: {
        type: "object",
        description: "Delivery address. Required when processing a SHIPPABLE transaction: a shippable product, or a session with a shippable line. Except for a purchase session (pa) whose read shows delivery.addressConfirmed: true for an address the payer entered on payware's page: leave it out, send deliveryAddressVersion, and payware uses it (400 ERR_MISSING_DELIVERY_ADDRESS when the session's address is unconfirmed, absent, or the agent's). For a pa, a country other than the session's is re-priced for that country, never refused for its price: re-read with the quote tool and send that total as amount.",
        properties: {
          fullName: {
            type: "string",
            description: "Recipient full name (required)",
            maxLength: 200
          },
          streetAddressLine1: {
            type: "string",
            description: "Street address line 1 (required)",
            maxLength: 300
          },
          streetAddressLine2: {
            type: "string",
            description: "Street address line 2 (optional)",
            maxLength: 300
          },
          zipCode: {
            type: "string",
            description: "ZIP code (required)",
            maxLength: 20
          },
          city: {
            type: "string",
            description: "City name (required)",
            maxLength: 100
          },
          region: {
            type: "string",
            description: "Region or state (optional: many countries have none)",
            maxLength: 200
          },
          country: {
            type: "string",
            description: "ISO 3166-1 alpha-2 code, e.g. BG (required)",
            maxLength: 32
          },
          phoneNumber: {
            type: "string",
            description: "Recipient phone number (required if email not provided)",
            maxLength: 255
          },
          email: {
            type: "string",
            description: "Recipient email address (required if phoneNumber not provided)",
            format: "email",
            maxLength: 255
          }
        },
        // DeliveryAddressValidationService: region is optional; a phone number or an email is required.
        required: ["fullName", "streetAddressLine1", "zipCode", "city", "country"]
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId", "friendlyName", "currency", "amount"]
  },

  async handler(args) {
    const {
      transactionId,
      account,
      friendlyName,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      passbackParams,
      timeToLive,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      paymentMethod,
      deliveryAddress,
      deliveryAddressVersion,
      quantity,
      tip,
      idempotencyKey,
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!friendlyName) {
      throw new Error("friendlyName is required for payment institutions");
    }

    if (!currency) {
      throw new Error("currency is required for payment institutions");
    }

    checkProcessArgs({ transactionId, amount, reasonL1 });
    checkTip({ tip, amount });

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }

    const result = await processPITransaction({
      transactionId,
      account,
      friendlyName,
      amount,
      currency,
      reasonL1,
      reasonL2,
      callbackUrl,
      passbackParams,
      timeToLive,
      partnerId,
      privateKey,
      paymentMethod,
      deliveryAddress,
      deliveryAddressVersion,
      quantity,
      tip,
      idempotencyKey,
      useSandbox
    });

    if (result.success) {
      return {
        content: [{
          type: "text",
          text: `🔄 **Payment Institution Transaction Processing Initiated**

**Transaction ID:** ${transactionId}
**Processing Status:** ✅ Successful

**Your Details:**
${account ? `- Account: ${account}` : '- Account: not sent (the payer\'s institution sends none)'}
- Friendly Name: ${friendlyName}
${amount ? `- Amount: ${amount} ${currency}` : ''}
${reasonL1 ? `- Reason: ${reasonL1}${reasonL2 ? ` (${reasonL2})` : ''}` : ''}
${paymentMethod ? `- Payment Method: ${paymentMethod}` : ''}
${quantity !== undefined ? `- Quantity: ${quantity}` : ''}
${tip !== undefined && tip !== null ? `- Tip: ${tip} ${currency} (payware recorded it on the payment; amount is the amount asked + tip)` : ''}
${timeToLive ? `- Time to Live: ${timeToLive} seconds` : ''}
${callbackUrl ? `- Callback URL: ${callbackUrl}` : ''}
${passbackParams ? `- Passback Params: ${passbackParams}` : ''}

**Transaction Details:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Next Steps:**
1. **TRANSACTION_PROCESSED** callback will be sent to counterparty
2. Wait for callback notification to your URL (if provided)
3. As the payer's institution, take the payer's single approval of both transfers and reserve the amount (or finalize with DECLINED if the payer declines)
4. Immediately before money moves, use \`payware_operations_finalize_transaction\` with status EXECUTING, echoing \`amount\` (exactly the amount you processed, tip included), \`fee\` and \`currency\` unchanged and naming the \`transferType\`${result.transaction?.deferredAllowed === true ? ' (this transaction carries deferredAllowed: true, so DEFERRED is allowed)' : ' (INSTANT or INTERNAL: this transaction does not carry deferredAllowed)'}. If payware refuses, release the reservation and move nothing
5. Execute the Merchant Leg (\`amount\` minus \`fee\`, to the payee); send CONFIRMED once it has completed (the status alone is enough), or FAILED if it was rejected
6. Fee Leg, where \`fee\` is above zero, to \`feeAccount\`: after CONFIRMED, for every transfer type (for DEFERRED, from the Fee Amount kept reserved since EXECUTING)
7. Handle final TRANSACTION_FINALIZED callbacks

**⚠️ Important:**
- As a payment institution, you must finalize this transaction
- It expires if EXECUTING has not been accepted within its time to live; once payware has accepted EXECUTING it no longer expires
- Callback URL is mandatory when processing as payee`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Payment Institution Transaction Processing Failed**

**Transaction ID:** ${transactionId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Payment Institution Issues:**
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found. **ERR_TRANSACTION_EXPIRED** (also 404): its time to live has run out and it is closed as unpaid
2. **ERR_ALREADY_PROCESSED**: Transaction already processed. **ERR_PAYEE_UNAVAILABLE** (409): the merchant being paid cannot accept payments; nothing was created or changed, do not take the payer's authorisation
3. **ERR_MISSING_PARTNER_ACCOUNT**: no account while processing as the payee (a transaction its payer created)
4. **ERR_MISSING_FRIENDLY_NAME**: Friendly name parameter missing
5. **ERR_MISSING_CALLBACK_URL**: Callback URL required when processing as payee
6. **ERR_INVALID_AMOUNT**: Amount validation failed, or below the amount the payment asks
7. **ERR_SPECIFYING_CURRENCY_NOT_ALLOWED**: Cannot change currency on merchant transactions
8. **ERR_AMOUNT_NOT_TOTAL** (409): a payment is paid exactly the amount it asks (its amount, or the total payware calculated), plus the tip where one is sent; re-read (or quote) and show the payer the amount to pay
9. **ERR_SESSION_ADDRESS_CHANGED** (409): a pa paid without deliveryAddress, and deliveryAddressVersion is missing or not the session's current address: read again and show the payer the new destination
10. **ERR_INVALID_TIP** (400) or **ERR_TIPS_NOT_ALLOWED** (409): the tip is not a plain decimal at the currency's scale, is 0 or above the amount asked, or the read had no tipsAllowed (the shop takes no tips, the payment already carries the merchant's tip, or the payer sets its amount)

**Troubleshooting:**
1. Verify transaction ID is correct: up to 32 characters, starts with 'pw' (standard), 'pr' (product), 'pl' (placement), 'ps' (soundbite), 'pi' (POI) or 'pa' (purchase session)
2. Ensure friendlyName is provided, and account when processing as the payee
3. Check currency matches original transaction currency
4. Verify callback URL is provided (especially for payee role)
5. Validate amount constraints based on your role in the transaction
6. Check if transaction requires delivery address (SHIPPABLE type: a shippable product or session)`
        }]
      };
    }
  }
};