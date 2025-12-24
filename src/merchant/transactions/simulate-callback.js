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
    passbackParams = null
  } = options;

  // Calculate fee like Java implementation: |payerAmount - amount| or |payeeAmount - amount|
  const transactionAmount = parseFloat(amount);
  let fee = '0.00';
  if (payerAmount !== null) {
    fee = Math.abs(parseFloat(payerAmount) - transactionAmount).toFixed(2);
  } else if (payeeAmount !== null) {
    fee = Math.abs(parseFloat(payeeAmount) - transactionAmount).toFixed(2);
  }

  const currentTime = Date.now();
  const basePayload = {
    callbackType: 'TRANSACTION_FINALIZED',
    transactionId,
    passbackParams,
    amount,
    fee,
    currency,
    status,
    statusMessage,
    ...(paymentMethod && { paymentMethod }),
    created: currentTime - 300000, // Created 5 minutes ago (milliseconds)
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
  description: "Simulate callback scenarios for testing webhook handling",
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
        description: "Fee amount charged by payment institution (e.g., '0.00' for no fee)",
        default: "0.00"
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
      fee = '0.00',
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