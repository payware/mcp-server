import { getPartnerIdSafe } from '../../config/env.js';
import { generateMockCallback, simulateCallbackDelivery } from '../../merchant/transactions/simulate-callback.js';

/**
 * Simulate the callback a merchant's endpoint receives, for an ISV building that handler.
 *
 * **This used to POST `/transactions/{id}/simulate-callback` with `{action: "CONFIRMED"}`.** There is
 * no such endpoint - a whole-tree search of the server finds no `simulate-callback` route in any
 * controller, in any profile - so every call 404'd, and the `action` field it sent is not a field on
 * any payware request. payware has no "trigger a callback for me" API at all.
 *
 * Simulation is therefore local, exactly as the merchant tool has always done it: build the payload
 * payware would send and hand it back, so a handler can be written and tested against the real
 * shape without a live transaction. The generator is imported from the merchant tool rather than
 * copied - one definition of the payload, so a contract change cannot fix one role and miss the
 * other, which is how the two drifted apart in the first place.
 */
export const simulateCallbackTool = {
  name: 'payware_operations_simulate_callback',
  description: `Simulate the callback payload payware sends to a merchant's callbackUrl, for building and testing a webhook handler as an ISV.

**Local only - this makes no API call.** payware has no endpoint that triggers a callback on demand,
so nothing here reaches the network. What you get back is the exact payload shape a real
TRANSACTION_FINALIZED callback carries, which is what a handler needs in order to be written.

**Where the callback goes.** A transaction you create on a merchant's behalf calls back to the
\`callbackUrl\` you give when creating it; a POI sale calls back to the POI's \`callbackUrl\`. Both are
signed with your ISV callback key, so verify them with your own payware public key. Give no callbackUrl
and that transaction sends no callbacks at all - the merchant's default URL is not used. Without a backend, follow the
transaction with \`payware_operations_get_transaction_status\` while it is ACTIVE and then
\`payware_operations_get_transaction_history\` once, or a POI sale with \`payware_poi_get_status\`.

Four properties of the real payload that are easy to get wrong:

**1. Absent means absent, not zero.** Properties with no value are omitted, not sent as \`null\` or
\`0\`. A missing \`fee\` means the fee is *unknown* for that transaction - not that it was free.

**2. \`finalized\` is absent on EXPIRED** - the expiry sweep sets no finalization moment.

**3. \`EXPIRED\` is a non-payment, not a failure.** The payer never paid within \`timeToLive\`. Release
the order or the stock; do not treat it as an error to retry.

**4. Deduplicate on \`(transactionId, callbackType)\`.** payware retries up to 15 times, backing off
from about a second to at most 5 minutes between attempts, until the endpoint answers any 2xx. That
pair is stable across retries and is the key payware guarantees.

A POI sale's callback also carries \`poiId\`, the POI that created the transaction.

**Not on this payload:** \`deliveryAddress\` (removed 2026-08-07 - fetch it from
\`payware_operations_get_transaction_history\`), \`producerPartnerId\`, \`transactionType\` and
\`initiatedBy\`.`,

  inputSchema: {
    type: 'object',
    required: ['transactionId'],
    properties: {
      transactionId: {
        type: 'string',
        description: 'Transaction ID to build the callback payload for'
      },
      status: {
        type: 'string',
        enum: ['CONFIRMED', 'DECLINED', 'FAILED', 'EXPIRED', 'CANCELLED'],
        description: 'Final status to simulate',
        default: 'CONFIRMED'
      },
      callbackUrl: {
        type: 'string',
        description: 'URL the callback would be delivered to. Recorded in the output for reference; no request is sent.',
        format: 'uri'
      },
      amount: {
        type: 'string',
        description: "Transaction amount as a decimal string at the currency's own scale (e.g. '57.60')",
        default: '57.60'
      },
      currency: {
        type: 'string',
        enum: ['EUR', 'USD', 'GBP'],
        description: 'Transaction currency',
        default: 'EUR'
      },
      fee: {
        type: 'string',
        description: "The payware fee, at the currency's smallest payable unit (e.g. '0.29'). Pass null to model the anomaly case where a transaction has no recorded fee and the server OMITS the property - deliberately distinguishable from a genuine '0.00'."
      },
      feeFixed: {
        type: 'string',
        description: 'Fixed fee component of the applicable fee configuration. Informational, for reconciliation. Present on FINALIZED callbacks since 2026-08-21.',
        default: '0.1000'
      },
      feeRate: {
        type: 'string',
        description: "Variable rate of the applicable fee configuration, e.g. '0.0150' = 1.5%. Informational, same as feeFixed.",
        default: '0.0150'
      },
      statusMessage: {
        type: 'string',
        description: 'Custom status message. DECLINED, FAILED and CANCELLED transactions always carry one.'
      },
      paymentMethod: {
        type: 'string',
        enum: ['A2A', 'CARD_FUNDED', 'BNPL', 'INSTANT_CREDIT'],
        description: 'Payment method chosen by the customer. A2A = direct transfer. CARD_FUNDED = card-linked account. BNPL = buy now pay later. INSTANT_CREDIT = credit line.'
      },
      poiId: {
        type: 'string',
        description: 'Set to simulate a POI sale: the callback then carries the poiId of the POI that created the transaction'
      },
      merchantPartnerId: {
        type: 'string',
        description: 'Partner ID of the merchant whose callback this simulates. Used for labelling only - no call is made on their behalf.'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Retained for consistency with the other tools; simulation is local and ignores it.',
        default: true
      }
    }
  },

  async handler(args) {
    const {
      transactionId,
      status = 'CONFIRMED',
      callbackUrl,
      amount = '57.60',
      currency = 'EUR',
      fee,
      feeFixed = '0.1000',
      feeRate = '0.0150',
      statusMessage,
      paymentMethod,
      poiId,
      merchantPartnerId
    } = args;

    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    const payload = generateMockCallback(transactionId, status, {
      amount, currency, fee, feeFixed, feeRate, statusMessage, paymentMethod, poiId
    });

    const delivery = callbackUrl ? await simulateCallbackDelivery(callbackUrl, payload) : null;

    return {
      content: [{
        type: 'text',
        text: `🔔 **Simulated Callback Payload**${merchantPartnerId ? ` (ISV ${getPartnerIdSafe()} -> Merchant ${merchantPartnerId})` : ''}

This is what payware would POST to the transaction's (or POI's) \`callbackUrl\`. No request was made.

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
${delivery ? `
**Would be delivered to:** ${delivery.url}
**Headers:** ${JSON.stringify(delivery.headers, null, 2)}
${delivery.note}
` : '**No callbackUrl given** - payload only.'}

**Building the handler:**
1. Answer any **2xx** or payware retries - up to 15 times, backing off from about a second to 5 minutes.
2. Deduplicate on \`(transactionId, callbackType)\`; retries repeat the same pair.
3. Read properties defensively: absent means absent, never zero.
4. Treat \`EXPIRED\` as a non-payment, not an error to retry.
5. Need the delivery address for a SHIPPABLE order? It is not here - call
   \`payware_operations_get_transaction_history\`.`
      }]
    };
  }
};
