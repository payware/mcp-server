/**
 * Simulate callback scenarios for testing
 */

/**
 * Generate mock callback payload
 * @param {string} transactionId - Transaction ID
 * @param {string} status - Transaction status (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED)
 * @param {Object} options - Additional options
 * @returns {Object} Mock callback payload
 */
export function generateMockCallback(transactionId, status = 'CONFIRMED', options = {}) {
  const {
    amount = '57.60',
    currency = 'EUR',
    payerAmount = null,
    payeeAmount = null,
    paymentMethod = null,
    statusMessage = null,
    passbackParams = null,
    // The fee breakdown the server attaches whenever the transaction has a fee configuration.
    // Before 2026-08-21 a merchant's FINALIZED callback carried the total fee but not the two
    // numbers that produced it, so reconciling a charge meant asking payware. It carries both now.
    feeFixed = '0.1000',
    feeRate = '0.0150',
    // Pass fee: null to model the anomaly the server reports by OMITTING the field - a transaction
    // with no recorded fee. That is deliberately distinguishable from a genuine "0.00".
    fee: feeOverride = undefined
  } = options;

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

  const currentTime = Date.now();
  // Built with the same omission rule the server applies. TransactionCallbackPayload is
  // @JsonInclude(NON_NULL), so a property with no value is ABSENT from the JSON rather than sent as
  // null or 0 - and a consumer is entitled to tell those apart. Emitting "passbackParams": null or
  // "fee": "0.0000" here would have taught an integrator to expect a shape the server never sends.
  const basePayload = {
    callbackType: 'TRANSACTION_FINALIZED',
    transactionId,
    ...(passbackParams !== null && passbackParams !== undefined && { passbackParams }),
    amount,
    ...(fee !== null && fee !== undefined && { fee }),
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

**4. Deduplicate on \`(transactionId, callbackType)\`.** payware retries a callback once a second, up
to 15 times, until the endpoint answers 200. That pair is stable across every retry of the same
event, and it is the key payware guarantees. A handler that does not deduplicate will eventually
process one payment twice.

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
        description: "Transaction amount (e.g., '57.60')",
        default: "57.60"
      },
      currency: {
        type: "string",
        enum: ["EUR", "USD", "GBP"],
        description: "Transaction currency",
        default: "EUR"
      },
      fee: {
        type: "string",
        description: "The payware fee on this transaction, at the currency's smallest payable unit (e.g. '0.29'). Not always two decimals - it follows the currency. Pass null to model the anomaly case, where a transaction has no recorded fee and the server OMITS the property entirely; that is deliberately distinguishable from a genuine '0.00'."
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
      }
    },
    required: ["transactionId"],
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      transactionId,
      status = 'CONFIRMED',
      callbackUrl,
      amount = '57.60',
      currency = 'EUR',
      // No default: an omitted fee falls through to generateMockCallback's own derivation.
      // Defaulting it to '0.00' here made every simulated callback assert a zero fee, which is the
      // one value the real payload never sends for "no fee" - it omits the property instead.
      fee,
      feeFixed = '0.1000',
      feeRate = '0.0150',
      statusMessage,
      paymentMethod
    } = args;
    
    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }
    
    // Generate mock callback payload
    const payload = generateMockCallback(transactionId, status, {
      amount,
      currency,
      fee,
      feeFixed,
      feeRate,
      statusMessage,
      paymentMethod
    });
    
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