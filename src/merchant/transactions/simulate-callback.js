/**
 * Simulate callback scenarios for testing
 */

/** The VAT inside a fee, present exactly when the fee is, as the server does: zero at the fee's scale unless given. */
export function feeVatFor(fee, feeVat) {
  if (fee === null || fee === undefined) return undefined;
  if (feeVat !== undefined && feeVat !== null) return feeVat;
  const decimals = (String(fee).split('.')[1] || '').length;
  return (0).toFixed(decimals);
}

/** Callback line fields: what the server copies from a payment's lines, with no image or terms fields. */
const CALLBACK_ITEM_FIELDS = ['type', 'productId', 'name', 'quantity', 'unitPrice', 'amount', 'country'];

/** The `items` parameter of both simulate tools, one definition. */
export const CALLBACK_ITEMS_PROPERTY = {
  type: 'array',
  description: 'Lines of a payment that has them (a product payment with a quantity, a purchase session, a merchant payment created with items): the callback then carries items and their total (the sum of the lines: what the payer paid). Each line: type (ITEM, SHIPPING, DISCOUNT, TAX or SURCHARGE), name, amount, and for an ITEM productId, quantity and unitPrice, for a SHIPPING line payware priced the country (a merchant\'s own lines carry none). Callback lines carry no images or terms. With items, leave amount out: on CONFIRMED it is worked out as total minus fee, on any other status it is the total.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['ITEM', 'SHIPPING', 'DISCOUNT', 'TAX', 'SURCHARGE'], description: 'Kind of line' },
      productId: { type: 'string', description: 'ITEM lines of payware products: the product id (pr + 8 characters)' },
      name: { type: 'string', description: 'What the line is. A payware-priced delivery line is named "Delivery"' },
      quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'ITEM lines: how many' },
      unitPrice: { type: 'string', description: 'ITEM lines: price of one unit, a decimal string' },
      amount: { type: 'string', description: 'The line total, a decimal string; negative only on a DISCOUNT' },
      country: { type: 'string', description: 'SHIPPING lines payware priced: ISO 3166-1 alpha-2 country of the delivery. A merchant\'s own lines carry none' }
    },
    required: ['type', 'name', 'amount']
  }
};

/** `a - b`, exact, for two decimal strings. */
export function subtractAmount(a, b) {
  const text = String(b);
  return sumAmounts([{ amount: a }, { amount: text.startsWith('-') ? text.slice(1) : `-${text}` }]);
}

/** Whether two decimal strings are the same amount (10 and 10.00 are). */
export function sameAmount(a, b) {
  return /^-?0+(\.0+)?$/.test(subtractAmount(a, b));
}

/** The sum of the lines' amounts, exact, at the finest scale any of them uses. */
export function sumAmounts(items) {
  const scale = Math.max(0, ...items.map(i => (String(i.amount).split('.')[1] || '').length));
  const total = items.reduce((sum, i) => {
    const text = String(i.amount);
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = text.replace('-', '').split('.');
    const cents = BigInt(whole || '0') * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
    return sum + (negative ? -cents : cents);
  }, 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

/**
 * Generate mock callback payload
 * @param {string} transactionId - Transaction ID
 * @param {string} status - Transaction status (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED)
 * @param {Object} options - Additional options
 * @returns {Object} Mock callback payload
 */
import { LOCAL } from '../../shared/tool-annotations.js';

export function generateMockCallback(transactionId, status = 'CONFIRMED', options = {}) {
  const {
    // With items, worked out from them when not given (see below); '57.60' otherwise.
    amount: amountOption = undefined,
    currency = 'EUR',
    payerAmount = null,
    payeeAmount = null,
    paymentMethod = null,
    statusMessage = null,
    passbackParams = null,
    // The POI that created the transaction, on a POI sale's callbacks only (server S8, 2026-09-28).
    poiId = null,
    // Enrichment of payments that came from a product, a placement or a purchase session, and of
    // payments with lines (server TransactionCallbackPayload, all NON_NULL, both callback types).
    productId = null,
    placementId = null,
    sessionId = null,
    items = null,
    // The fee breakdown the server attaches whenever the transaction has a fee configuration.
    // Before 2026-08-21 a merchant's FINALIZED callback carried the total fee but not the two
    // numbers that produced it, so reconciling a charge meant asking payware. It carries both now.
    feeFixed = '0.1000',
    feeRate = '0.0150',
    // Pass fee: null to model the anomaly the server reports by OMITTING the field - a transaction
    // with no recorded fee. That is deliberately distinguishable from a genuine "0.00".
    fee: feeOverride = undefined,
    // The VAT inside fee (split fee model): present exactly when fee is, zero when none applies.
    feeVat: feeVatOverride = undefined
  } = options;

  // A payment's lines decide its money, as on the server (TransactionCallbackEnrichment, TransactionService): total is
  // the sum of the lines, what the payer paid. On CONFIRMED amount is net of the fee, so amount + fee = total; on any
  // other status nothing was paid and amount is still the requested amount, the total. Review finding C-M5: amount
  // used to default to 57.60 beside any lines, a payload the server never sends.
  const lines = Array.isArray(items) && items.length > 0 ? items : null;
  const total = lines ? sumAmounts(lines) : undefined;
  let amount = amountOption ?? total ?? '57.60';

  // Calculate fee like the server: |payerAmount - amount| or |payeeAmount - amount|.
  const transactionAmount = parseFloat(amount);
  let fee = '0.00';
  if (payerAmount !== null) {
    fee = Math.abs(parseFloat(payerAmount) - transactionAmount).toFixed(2);
  } else if (payeeAmount !== null) {
    fee = Math.abs(parseFloat(payeeAmount) - transactionAmount).toFixed(2);
  }
  if (feeOverride !== undefined) {
    fee = feeOverride;
  }

  if (lines) {
    const hasFee = fee !== null && fee !== undefined;
    const expected = status === 'CONFIRMED' && hasFee ? subtractAmount(total, fee) : total;
    if (amountOption !== undefined && amountOption !== null && !sameAmount(amountOption, expected)) {
      throw new Error(status === 'CONFIRMED'
        ? `On a CONFIRMED callback amount is net of the fee: with these lines (total ${total}) and fee ${hasFee ? fee : 'absent'} it is ${expected}, not ${amountOption}. Leave amount out and it is worked out.`
        : `Nothing was paid on a ${status} callback, so amount is the requested amount, the lines' total ${total}, not ${amountOption}. Leave amount out and it is worked out.`);
    }
    amount = amountOption ?? expected;
  }

  const currentTime = Date.now();
  // Built with the same omission rule the server applies. TransactionCallbackPayload is
  // @JsonInclude(NON_NULL), so a property with no value is ABSENT from the JSON rather than sent as
  // null or 0 - and a consumer is entitled to tell those apart. Emitting "passbackParams": null or
  // "fee": "0.0000" here would have taught an integrator to expect a shape the server never sends.
  const basePayload = {
    callbackType: 'TRANSACTION_FINALIZED',
    transactionId,
    ...(poiId && { poiId }),
    ...(productId && { productId }),
    ...(placementId && { placementId }),
    ...(sessionId && { sessionId }),
    ...(lines && {
      items: lines.map(line => Object.fromEntries(CALLBACK_ITEM_FIELDS.filter(k => line[k] !== undefined && line[k] !== null).map(k => [k, line[k]]))),
      total
    }),
    ...(passbackParams !== null && passbackParams !== undefined && { passbackParams }),
    amount,
    ...(fee !== null && fee !== undefined && { fee, feeVat: feeVatFor(fee, feeVatOverride) }),
    ...(feeFixed !== null && feeFixed !== undefined && { feeFixed }),
    ...(feeRate !== null && feeRate !== undefined && { feeRate }),
    currency,
    status,
    ...(statusMessage !== null && statusMessage !== undefined && { statusMessage }),
    ...(paymentMethod && { paymentMethod }),
    created: currentTime - 300000, // Created 5 minutes ago (milliseconds)
    // Absent on EXPIRED: the expiry sweep transitions status in bulk and sets no finalized moment.
    ...(status !== 'EXPIRED' && { finalized: currentTime })
  };
  
  // Add status-specific statusMessage
  switch (status) {
    case 'CONFIRMED':
      return {
        ...basePayload,
        statusMessage: statusMessage || 'Transaction confirmed'
      };

    case 'DECLINED':
      return {
        ...basePayload,
        statusMessage: statusMessage || 'Insufficient funds'
      };

    case 'FAILED':
      return {
        ...basePayload,
        statusMessage: statusMessage || 'Payment processing failed'
      };

    case 'EXPIRED':
      return {
        ...basePayload,
        statusMessage: statusMessage || 'Transaction expired',
        finalized: undefined // Remove finalized for expired transactions
      };

    case 'CANCELLED':
      return {
        ...basePayload,
        statusMessage: statusMessage || 'Transaction cancelled'
      };

    default:
      return basePayload;
  }
}

/**
 * Simulate callback delivery
 * @param {string} callbackUrl - URL to send callback to
 * @param {Object} payload - Callback payload
 * @returns {Object} Simulation result
 */
export async function simulateCallbackDelivery(callbackUrl, payload) {
  if (!callbackUrl || !callbackUrl.startsWith('http')) {
    return {
      success: false,
      error: 'Invalid callback URL provided'
    };
  }
  
  // In a real implementation, this would actually send HTTP POST
  // For simulation, we just return what would be sent
  return {
    success: true,
    url: callbackUrl,
    payload,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-jwt-token-' + Date.now()
    },
    simulatedAt: new Date().toISOString(),
    note: 'This is a simulation - no actual HTTP request was made. Real payware callbacks use JWT tokens in Authorization header.'
  };
}

/**
 * Simulate callback tool implementation
 */
export const simulateCallbackTool = {
  name: "payware_operations_simulate_callback",
  annotations: LOCAL,
  description: `Simulate callback scenarios for testing webhook handling.

Generates the payload a merchant's \`callbackUrl\` actually receives, so a handler can be built and
tested against the real shape. Four properties of that shape are easy to get wrong:

**1. Absent means absent, not zero.** The payload omits properties with no value rather than sending
\`null\` or \`0\`. \`statusMessage\`, \`passbackParams\`, \`fee\`, \`feeFixed\` and \`feeRate\` are all simply
missing when they do not apply. A missing \`fee\` means the fee is *unknown* for that transaction - it
does not mean the transaction was free. Do not write a handler that reads \`payload.fee\` as a number
without checking it is there.

**2. \`finalized\` is absent on EXPIRED.** An expired transaction is closed by the platform's expiry
sweep, which sets no finalization moment. Every other status carries one.

**3. \`EXPIRED\` is a non-payment, not a failure.** The payer never paid within \`timeToLive\`. Release
the order or the stock, as you would for a cancellation - do not treat it as an error to retry.

**4. Deduplicate on \`(transactionId, callbackType)\`.** payware retries a callback up to 15 times,
backing off from about a second to at most 5 minutes between attempts, until the endpoint answers any
2xx. That pair is stable across every retry of the same event, and it is the key payware guarantees.
A handler that does not deduplicate will eventually process one payment twice.

**Payments with a product, a placement, a session or lines.** The payload also carries, when they apply and absent otherwise: \`productId\` (the product the payment came from), \`placementId\` (the placement it is attributed to, Premium only), \`sessionId\` (the purchase session's pa id) and \`items\` with their \`total\` (type, productId, name, quantity, unitPrice, amount, and country on a delivery line payware priced; no images). \`total\` is the sum of the lines, what the payer paid. On CONFIRMED \`amount\` is net of the fee, so **\`amount\` + \`fee\` = \`total\`**; on any other status nothing was paid and \`amount\` equals \`total\`. Give \`items\` and leave \`amount\` out: the tool works it out, and refuses an \`amount\` the server would never send with those lines.

**Not on this payload:** \`deliveryAddress\` (removed 2026-08-07 - fetch it from
\`payware_operations_get_transaction_history\`, which is authenticated and tenant-scoped),
\`producerPartnerId\`, \`transactionType\` and \`initiatedBy\` (the last two are carried on
TRANSACTION_PROCESSED, which merchants do not receive).`,
  inputSchema: {
    type: "object", 
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to simulate callback for"
      },
      status: {
        type: "string",
        enum: ["CONFIRMED", "DECLINED", "FAILED", "EXPIRED", "CANCELLED"],
        description: "Transaction status to simulate",
        default: "CONFIRMED"
      },
      callbackUrl: {
        type: "string",
        description: "URL where callback would be sent (for simulation only)",
        format: "uri"
      },
      amount: {
        type: "string",
        description: "Transaction amount (e.g., '57.60'; that is the default without items). With items leave it out: on CONFIRMED it is total minus fee, on any other status the total; a different value is refused"
      },
      currency: {
        type: "string",
        enum: ["EUR", "USD", "GBP"],
        description: "Transaction currency",
        default: "EUR"
      },
      fee: {
        type: "string",
        description: "payware's fee on this transaction plus VAT where it applies, at the currency's smallest payable unit (e.g. '0.29'). The payer's institution transfers it to payware alongside the merchant's payment, and amount is net of it. Not always two decimals - it follows the currency. Pass null to model the anomaly case, where a transaction has no recorded fee and the server OMITS the property entirely; that is deliberately distinguishable from a genuine '0.00'."
      },
      feeVat: {
        type: "string",
        description: "The VAT included in fee (fee minus feeVat is payware's fee excluding VAT), at the same scale; zero when no VAT applies (reverse charge, or a merchant outside the EU). Present exactly when fee is (server TransactionCallbackPayload). Defaults to zero."
      },
      feeFixed: {
        type: "string",
        description: "Fixed fee component of the applicable fee configuration, e.g. '0.1000'. Informational, for reconciliation. Present on FINALIZED callbacks since 2026-08-21 - before that a merchant got the total fee but not the breakdown that produced it. Pass null to model a transaction with no fee configuration, where it is omitted.",
        default: "0.1000"
      },
      feeRate: {
        type: "string",
        description: "Variable rate of the applicable fee configuration, e.g. '0.0150' = 1.5%. Informational, same as feeFixed. Pass null to model a transaction with no fee configuration.",
        default: "0.0150"
      },
      statusMessage: {
        type: "string",
        description: "Custom status message for the transaction callback"
      },
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "Payment method chosen by customer. A2A = direct transfer. CARD_FUNDED = card-linked account. BNPL = buy now pay later. INSTANT_CREDIT = credit line."
      },
      poiId: {
        type: "string",
        description: "Set to simulate a POI sale: the callback then carries the poiId of the POI that created the transaction"
      },
      productId: {
        type: "string",
        description: "Set to simulate a payment that came from a product: the callback then carries the productId (from the product snapshot)"
      },
      placementId: {
        type: "string",
        description: "Set to simulate a payment attributed to a placement (Premium merchants): the callback then carries the placementId"
      },
      sessionId: {
        type: "string",
        description: "Set to simulate a payment that came from an agent purchase session: the callback then carries the session's pa id"
      },
      items: CALLBACK_ITEMS_PROPERTY
    },
    required: ["transactionId"],
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      transactionId,
      status = 'CONFIRMED',
      callbackUrl,
      // No default: with items generateMockCallback works it out from them, else it is 57.60.
      amount,
      currency = 'EUR',
      // No default: an omitted fee falls through to generateMockCallback's own derivation.
      // Defaulting it to '0.00' here made every simulated callback assert a zero fee, which is the
      // one value the real payload never sends for "no fee" - it omits the property instead.
      fee,
      feeVat,
      feeFixed = '0.1000',
      feeRate = '0.0150',
      statusMessage,
      paymentMethod,
      poiId,
      productId,
      placementId,
      sessionId,
      items
    } = args;
    
    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }
    
    // Generate mock callback payload
    let payload;
    try {
      payload = generateMockCallback(transactionId, status, {
        amount,
        currency,
        fee,
        feeVat,
        feeFixed,
        feeRate,
        statusMessage,
        paymentMethod,
        poiId,
        productId,
        placementId,
        sessionId,
        items
      });
    } catch (error) {
      return { content: [{ type: "text", text: `❌ **Callback Simulation Refused**\n\n${error.message}` }], isError: true };
    }
    
    // Simulate callback delivery if URL provided
    let deliveryResult = null;
    if (callbackUrl) {
      deliveryResult = await simulateCallbackDelivery(callbackUrl, payload);
    }
    
    const statusEmojis = {
      'CONFIRMED': '✅',
      'DECLINED': '❌', 
      'FAILED': '💥',
      'EXPIRED': '⏰',
      'CANCELLED': '🚫'
    };
    
    const statusEmoji = statusEmojis[status] || '❓';
    
    return {
      content: [{
        type: "text",
        text: `🔄 **Callback Simulation Complete**

**Transaction:** ${transactionId}
**Simulated Status:** ${statusEmoji} ${status}

**Mock Callback Payload:**
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

${deliveryResult ? `
**Callback Delivery Simulation:**
${deliveryResult.success ? '✅ Callback would be delivered successfully' : '❌ Callback delivery would fail'}

**Delivery Details:**
- URL: ${deliveryResult.url || 'N/A'}
- Headers: ${JSON.stringify(deliveryResult.headers || {}, null, 2)}
- Simulated At: ${deliveryResult.simulatedAt || 'N/A'}

**Note:** ${deliveryResult.note || 'No actual HTTP request was made'}
` : '**No callback URL provided** - only payload generated'}

**Status Explanations:**
- ✅ **CONFIRMED**: Successfully finalized
- ❌ **DECLINED**: Declined by the user, processing or finalizing payment institutions
- 💥 **FAILED**: Failed due to technical reasons or other
- ⏰ **EXPIRED**: Time to live of the transaction has passed
- 🚫 **CANCELLED**: Transaction canceled by the originator

**Integration Testing:**
1. Use this payload to test your callback handler
2. Verify your system processes each status correctly
3. Check error handling for DECLINED/FAILED statuses
4. Ensure proper logging and monitoring

**Next Steps:**
1. Implement callback endpoint to receive this payload
2. Test with different status scenarios
3. Add signature verification in production
4. Set up proper error handling and retry logic`
      }]
    };
  }
};