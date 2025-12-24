/**
 * Simulate payment institution callback scenarios for testing
 * Payment institutions receive TRANSACTION_PROCESSED and TRANSACTION_FINALIZED callbacks
 */

/**
 * Generate mock payment institution callback payload
 * @param {string} transactionId - Transaction ID
 * @param {string} callbackType - Callback type (TRANSACTION_PROCESSED, TRANSACTION_FINALIZED)
 * @param {Object} options - Additional options
 * @returns {Object} Mock callback payload
 */
export function generateMockPICallback(transactionId, callbackType = 'TRANSACTION_PROCESSED', options = {}) {
  const {
    amount = '57.00',
    currency = 'EUR',
    payerAmount = null,
    payeeAmount = null,
    payeeBIC = 'SBBICID1',
    payeeAccount = 'M-1W-1account2',
    payeeFriendlyName = 'payware',
    payerBIC = 'SBBICID1',
    payerAccount = 'payerAccount',
    payerFriendlyName = 'Demo Financial Institution',
    reasonL1 = '57',
    reasonL2 = null,
    timeToLive = 600,
    initiatedBy = 'PEER',
    transactionType = 'DEFAULT',
    paymentMethod = null,
    status = 'CONFIRMED',
    statusMessage = null,
    passbackParams = null
  } = options;

  // Calculate fee like Java implementation: |payerAmount - amount| or |payeeAmount - amount|
  const transactionAmount = parseFloat(amount);
  let fee = '0.60'; // Default fee
  if (payerAmount !== null) {
    fee = Math.abs(parseFloat(payerAmount) - transactionAmount).toFixed(2);
  } else if (payeeAmount !== null) {
    fee = Math.abs(parseFloat(payeeAmount) - transactionAmount).toFixed(2);
  }

  // Build payload based on callback type (matching Java implementation exactly)
  if (callbackType === 'TRANSACTION_PROCESSED') {
    return {
      callbackType,
      transactionId,
      passbackParams,
      amount,
      fee,
      currency,
      payeeBIC,
      payeeAccount,
      payeeFriendlyName,
      payerBIC,
      payerAccount,
      payerFriendlyName,
      reasonL1,
      ...(reasonL2 && { reasonL2 }),
      timeToLive,
      transactionType,
      initiatedBy,
      ...(paymentMethod && { paymentMethod })
    };
  } else {
    // TRANSACTION_FINALIZED
    return {
      callbackType,
      transactionId,
      passbackParams,
      amount,
      fee,
      currency,
      status,
      ...(statusMessage && { statusMessage }),
      ...(paymentMethod && { paymentMethod }),
      created: Date.now() - 300000, // Created 5 minutes ago (milliseconds)
      finalized: Date.now()
    };
  }
}

/**
 * Simulate callback delivery for payment institutions
 * @param {string} callbackUrl - URL to send callback to
 * @param {Object} payload - Callback payload
 * @returns {Object} Simulation result
 */
export async function simulatePICallbackDelivery(callbackUrl, payload) {
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
 * Payment Institution callback simulation tool implementation
 */
export const simulatePICallbackTool = {
  name: "payware_operations_simulate_callback",
  description: "Simulate payment institution callback scenarios for testing webhook handling. Payment institutions receive TRANSACTION_PROCESSED when merchant processes their transaction, and TRANSACTION_FINALIZED when transaction is completed.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to simulate callback for"
      },
      callbackType: {
        type: "string",
        enum: ["TRANSACTION_PROCESSED", "TRANSACTION_FINALIZED"],
        description: "Type of callback to simulate",
        default: "TRANSACTION_PROCESSED"
      },
      callbackUrl: {
        type: "string",
        description: "URL where callback would be sent (for simulation only)",
        format: "uri"
      },
      amount: {
        type: "string",
        description: "Transaction amount (e.g., '57.00')",
        default: "57.00"
      },
      currency: {
        type: "string",
        enum: ["EUR", "USD", "GBP"],
        description: "Transaction currency",
        default: "EUR"
      },
      fee: {
        type: "string",
        description: "Fee amount charged by payment institution (e.g., '0.60')",
        default: "0.60"
      },
      payeeBIC: {
        type: "string",
        description: "Payee's BIC code",
        default: "SBBICID1"
      },
      payeeAccount: {
        type: "string",
        description: "Payee account identifier",
        default: "M-1W-1account2"
      },
      payeeFriendlyName: {
        type: "string",
        description: "Payee friendly name",
        default: "payware"
      },
      payerBIC: {
        type: "string",
        description: "Payer's BIC code",
        default: "SBBICID1"
      },
      payerAccount: {
        type: "string",
        description: "Payer account identifier",
        default: "payerAccount"
      },
      payerFriendlyName: {
        type: "string",
        description: "Payer friendly name",
        default: "Demo Financial Institution"
      },
      reasonL1: {
        type: "string",
        description: "Transaction reason line 1",
        default: "57"
      },
      reasonL2: {
        type: "string",
        description: "Transaction reason line 2 (optional)"
      },
      timeToLive: {
        type: "number",
        description: "Remaining time to live in seconds",
        default: 600
      },
      status: {
        type: "string",
        enum: ["CONFIRMED", "DECLINED", "FAILED", "CANCELLED"],
        description: "Transaction status (only for TRANSACTION_FINALIZED callbacks)",
        default: "CONFIRMED"
      },
      statusMessage: {
        type: "string",
        description: "Status message (only for TRANSACTION_FINALIZED callbacks)"
      },
      paymentMethod: {
        type: "string",
        enum: ["A2A", "CARD_FUNDED", "BNPL", "INSTANT_CREDIT"],
        description: "Payment method chosen by customer. A2A = direct transfer. CARD_FUNDED = card-linked account. BNPL = buy now pay later. INSTANT_CREDIT = credit line."
      }
    },
    required: ["transactionId"]
  },

  async handler(args) {
    const {
      transactionId,
      callbackType = 'TRANSACTION_PROCESSED',
      callbackUrl,
      amount = '57.00',
      currency = 'EUR',
      fee = '0.60',
      payeeBIC = 'SBBICID1',
      payeeAccount = 'M-1W-1account2',
      payeeFriendlyName = 'payware',
      payerBIC = 'SBBICID1',
      payerAccount = 'payerAccount',
      payerFriendlyName = 'Demo Financial Institution',
      reasonL1 = '57',
      reasonL2,
      timeToLive = 600,
      status = 'CONFIRMED',
      statusMessage,
      paymentMethod
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    // Generate mock callback payload
    const payload = generateMockPICallback(transactionId, callbackType, {
      amount,
      currency,
      fee,
      payeeBIC,
      payeeAccount,
      payeeFriendlyName,
      payerBIC,
      payerAccount,
      payerFriendlyName,
      reasonL1,
      reasonL2,
      timeToLive,
      initiatedBy: 'PEER',
      transactionType: 'DEFAULT',
      paymentMethod,
      status,
      statusMessage
    });

    // Simulate callback delivery if URL provided
    let deliveryResult = null;
    if (callbackUrl) {
      deliveryResult = await simulatePICallbackDelivery(callbackUrl, payload);
    }

    const callbackEmojis = {
      'TRANSACTION_PROCESSED': '🔄',
      'TRANSACTION_FINALIZED': '✅'
    };

    const statusEmojis = {
      'CONFIRMED': '✅',
      'DECLINED': '❌',
      'FAILED': '💥',
      'CANCELLED': '🚫'
    };

    const callbackEmoji = callbackEmojis[callbackType] || '📨';
    const statusEmoji = statusEmojis[status] || '❓';

    return {
      content: [{
        type: "text",
        text: `${callbackEmoji} **Payment Institution Callback Simulation Complete**

**Transaction:** ${transactionId}
**Callback Type:** ${callbackType}
${callbackType === 'TRANSACTION_FINALIZED' ? `**Status:** ${statusEmoji} ${status}` : ''}

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

**Payment Institution Callback Types:**
- 🔄 **TRANSACTION_PROCESSED**: Merchant has processed your transaction (ready for finalization)
- ✅ **TRANSACTION_FINALIZED**: Transaction completed with final status

**Transaction Flow:**
1. Payment Institution creates transaction as SRC (payer) or DST (payee)
2. Transaction can be processed by merchant OR payment institution → **TRANSACTION_PROCESSED** callback to PI
3. Transaction can be finalized ONLY by payment institution → **TRANSACTION_FINALIZED** callback to PI
4. Transaction can be cancelled ONLY by its issuer (creator)

**Integration Testing:**
1. Use this payload to test your payment institution callback handler
2. Verify handling of both TRANSACTION_PROCESSED and TRANSACTION_FINALIZED
3. Test different status scenarios for finalized transactions
4. Ensure proper BIC and account information processing

**Next Steps:**
1. Implement callback endpoint to receive this payload structure
2. Test with both callback types
3. Add signature verification in production
4. Set up proper error handling and retry logic`
      }]
    };
  }
};