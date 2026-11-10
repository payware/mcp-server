import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { COMMITS } from '../../shared/tool-annotations.js';

export const FINALIZE_STATUSES = ['EXECUTING', 'CONFIRMED', 'CANCELLED', 'DECLINED', 'FAILED'];
export const TRANSFER_TYPES = ['INSTANT', 'INTERNAL', 'DEFERRED'];
export const FEE_LEG_OUTCOMES = ['NOT_EXECUTED', 'RETURNED'];

const isBlank = value => value === undefined || value === null || value === '';

/**
 * Refuse a finalize the server would refuse for its shape, before anything is signed or sent.
 *
 * The execution lock (server docs/execution-lock.md, 2026-11-10) splits finalizing in two:
 * EXECUTING immediately before money moves, carrying everything payware checks, then CONFIRMED or
 * FAILED once the Merchant Leg has completed or been rejected. So the amount, fee, currency and
 * transfer type are required at EXECUTING and optional at CONFIRMED, where they must equal the lock.
 * What depends on the lock itself (DEFERRED needs the merchant's opt-in, feeLegOutcome is required
 * after a DEFERRED lock) is the server's to decide: this tool cannot see the lock.
 */
export function checkFinalizeArgs({ transactionId, status, statusMessage, amount, fee, currency, transferType, feeLegOutcome }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!status || !FINALIZE_STATUSES.includes(status)) {
    throw new Error(`status is required and must be one of: ${FINALIZE_STATUSES.join(', ')}`);
  }

  if (['CANCELLED', 'DECLINED', 'FAILED'].includes(status) && !statusMessage) {
    throw new Error(`statusMessage is required for status: ${status}`);
  }

  if (status === 'EXECUTING') {
    if (isBlank(amount)) {
      throw new Error('amount is required for EXECUTING');
    }
    if (!currency) {
      throw new Error('currency is required for EXECUTING');
    }
    if (isBlank(fee)) {
      throw new Error('fee is required for EXECUTING (use 0 for no fee)');
    }
    if (!transferType) {
      throw new Error('transferType is required for EXECUTING (ERR_MISSING_TRANSFER_TYPE): one of INSTANT, INTERNAL, DEFERRED');
    }
  }

  if (!isBlank(transferType)) {
    if (!TRANSFER_TYPES.includes(transferType)) {
      throw new Error(`transferType must be one of: ${TRANSFER_TYPES.join(', ')} (ERR_INVALID_TRANSFER_TYPE)`);
    }
    if (!['EXECUTING', 'CONFIRMED'].includes(status)) {
      // Stricter than the server, which parses the field on every status and ignores it where it means
      // nothing: a transfer type on a decline is a sign the call is not the one meant.
      throw new Error('transferType is sent with EXECUTING, and optionally repeated with CONFIRMED; not with ' + status + ' (the server would ignore it there)');
    }
  }

  if (!isBlank(feeLegOutcome)) {
    if (!FEE_LEG_OUTCOMES.includes(feeLegOutcome)) {
      throw new Error(`feeLegOutcome must be one of: ${FEE_LEG_OUTCOMES.join(', ')} (ERR_INVALID_FEE_LEG_OUTCOME)`);
    }
    if (status !== 'FAILED') {
      // Stricter than the server, which ignores it on other statuses (FIValidationService parses it on
      // every status): a fee leg outcome on CONFIRMED is a sign the call is not the one meant.
      throw new Error('feeLegOutcome is sent with FAILED only (the server would ignore it on ' + status + ')');
    }
  }
}

/**
 * The request body for each status. EXECUTING carries the amount, fee, currency and transfer type;
 * CONFIRMED carries whichever of them the caller repeats (none is needed after the lock); FAILED
 * carries its fee leg outcome when given. CANCELLED and DECLINED carry the status message only.
 */
export function finalizeRequestBody({ status, statusMessage, amount, fee, currency, transferType, feeLegOutcome }) {
  const carriesExecution = status === 'EXECUTING' || status === 'CONFIRMED';
  return {
    status,
    ...(statusMessage && { statusMessage }),
    ...(carriesExecution && !isBlank(amount) && { amount: amount.toString() }),
    ...(carriesExecution && !isBlank(fee) && { fee: fee.toString() }),
    ...(carriesExecution && currency && { currency }),
    ...(carriesExecution && transferType && { transferType }),
    ...(status === 'FAILED' && feeLegOutcome && { feeLegOutcome })
  };
}

/**
 * Finalize a transaction as a payment institution via payware API: EXECUTING immediately before
 * money moves, then CONFIRMED once the Merchant Leg has completed, or FAILED if it was rejected
 * @param {Object} params - Transaction finalization parameters
 * @returns {Object} Transaction finalization response
 */
export async function finalizeTransaction({
  transactionId,
  status,
  statusMessage,
  amount,
  fee,
  currency,
  transferType,
  feeLegOutcome,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  checkFinalizeArgs({ transactionId, status, statusMessage, amount, fee, currency, transferType, feeLegOutcome });

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  const requestBody = finalizeRequestBody({ status, statusMessage, amount, fee, currency, transferType, feeLegOutcome });

  // Convert to deterministic minimized JSON for SHA-256 calculation
  const minimizedBodyString = createMinimizedJSON(requestBody);

  // Create JWT token with contentSha256 for the request body (PATCH requires contentSha256)
  const tokenData = createJWTToken(partnerId, privateKey, minimizedBodyString);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    // Send the exact minimized JSON string that was used for SHA-256 calculation
    const response = await axios.patch(`${baseUrl}/transactions/${transactionId}`, minimizedBodyString, {
      headers,
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });

    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-correlation-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}

/**
 * What a failed EXECUTING means for the money. A refusal (400, 404, 503) means nothing may move. A
 * 409 means the transaction is already locked or final, so the state has to be read, not assumed.
 * No answer at all means the lock may or may not be in place; the identical EXECUTING is a safe replay.
 */
function lockRefusalNote(error) {
  const httpStatus = error.status;
  // Only payware's own answer is a refusal: a body with an errorCode, or a 4xx. A 502 or 504 from a proxy,
  // or no answer at all, says nothing about the lock, which may have been committed behind it.
  const paywareAnswered = Boolean(error.errorCode) || (httpStatus >= 400 && httpStatus < 500);
  if (!paywareAnswered) {
    return 'No answer from payware itself (no response, or a gateway error without an errorCode), so the lock may or may not be in place. Move no money: repeat the identical EXECUTING, which payware answers without side effects if it was already applied.';
  }
  if (httpStatus === 409) {
    return 'The transaction is already locked with a different body, or already final. Check it with payware_operations_get_transaction_status (pending) or payware_operations_get_transaction_history (final) before moving any money.';
  }
  return 'payware refused the lock, so no money may move: release the reservation.';
}

/** What to do after each accepted status, for the success text. */
function nextStepsFor(status, transferType, statusMessage) {
  switch (status) {
    case 'EXECUTING':
      return `1. 🔒 payware has locked the transaction: it has left the expiry clock and payware will not refuse its CONFIRMED or FAILED for reasons of its own
2. Execute the Merchant Leg now: the \`amount\` of this response, already net of the fee (\`payerAmount\` is the gross), to the payee, the transaction ID as remittance information${transferType === 'DEFERRED' ? `
3. DEFERRED: send the Fee Leg (\`fee\`, to \`feeAccount\`) together with the Merchant Leg, so the payer cannot cancel it during the wait` : ''}
${transferType === 'DEFERRED' ? '4' : '3'}. Send CONFIRMED (the status alone is enough) only once the Merchant Leg has completed${transferType === 'INSTANT' ? ' - for INSTANT, on the receiving bank\'s confirmation' : transferType === 'INTERNAL' ? ' - for INTERNAL, once credited' : transferType === 'DEFERRED' ? ' - for DEFERRED, once settled to the merchant\'s account, which can take days' : ''}
${transferType === 'DEFERRED' ? '5' : '4'}. If the Merchant Leg is rejected, send FAILED with a statusMessage${transferType === 'DEFERRED' ? ' and feeLegOutcome (RETURNED once you have returned the Fee Leg to the payer, NOT_EXECUTED if it never left)' : ''}`;
    case 'CONFIRMED':
      return `1. ✅ The Merchant Leg has completed and the transaction is final
2. ${transferType === 'DEFERRED' ? 'DEFERRED: the Fee Leg already went with the Merchant Leg' : 'Execute the Fee Leg now, where `fee` is greater than zero (`fee`, to `feeAccount`, the transaction ID as remittance information). For a DEFERRED lock it already went with the Merchant Leg'}
3. A later return (recall, PSD2 Article 73/89 refund) is a reversal: tell payware the transaction ID
4. Use \`payware_operations_get_transaction_history\` to retrieve details later`;
    default:
      return `1. ⚠️ Payment not completed due to: ${statusMessage || status}
2. Transaction marked as ${status} in payware system
3. All parties notified via callbacks`;
  }
}

/**
 * Finalize transaction tool implementation
 */
export const finalizeTransactionTool = {
  name: "payware_operations_finalize_transaction",
  annotations: COMMITS,
  description: `Finalize a transaction as a payment institution. It takes two calls around the money movement: **EXECUTING** immediately before money moves, then **CONFIRMED** once the Merchant Leg has completed, or **FAILED** if it was rejected.

**Order of operations (mandatory):**
1. Process the transaction (\`payware_operations_process_transaction\`), run your checks, take the payer's single approval (SCA) of both transfers and reserve the amount.
2. Immediately before money moves, send **EXECUTING** with \`amount\`, \`fee\`, \`currency\` and \`transferType\`. payware checks everything (processed, sent by the payer's institution, currency, amount, the fee echo, fee configuration and exchange rate, the time to live) and, if it accepts, locks the transaction: it leaves the expiry clock, and payware will not refuse it afterwards for reasons of its own. **A refusal means nothing moves**: release the reservation.
3. Execute the Merchant Leg to the payee: the payer amount minus \`fee\`, which is the \`amount\` the EXECUTING response returns (already net; \`payerAmount\` there is the gross).
4. Send **CONFIRMED** only once the Merchant Leg has completed (INSTANT: the receiving bank's confirmation under Article 5a(4)(c) of Regulation (EU) No 260/2012; INTERNAL: credited; DEFERRED: settled to the merchant's account), or **FAILED** if it was rejected. CONFIRMED after EXECUTING may be sent with just the status; an \`amount\`, \`fee\`, \`currency\` or \`transferType\` you repeat must equal the locked value (409 ERR_EXECUTION_MISMATCH).
5. Fee Leg (\`fee\`, to payware's fee account \`feeAccount\` from the process response): for INSTANT and INTERNAL, after payware has accepted CONFIRMED; for DEFERRED, together with sending the Merchant Leg, so the payer cannot cancel it during the wait. If a DEFERRED Merchant Leg is then rejected, return the Fee Leg to the payer and send FAILED with \`feeLegOutcome: RETURNED\`.

Each transfer goes in full, with the transaction ID as remittance information; nothing is deducted from either. CONFIRMED or FAILED from ACTIVE (no EXECUTING first) is refused with 409 ERR_NOT_EXECUTING.

**Timing:** send EXECUTING within 5 seconds of the payer's approval; a payer waiting at a till should not wait more than 15 seconds for CONFIRMED.

**A lock is a promise to report.** payware never closes a locked transaction itself, because money may have moved. One left in EXECUTING is flagged to payware support after 60 seconds for INSTANT and INTERNAL, and after two TARGET2 business days for DEFERRED, and payware then asks your institution for its outcome.

**Statuses:**
- **EXECUTING**: the lock, sent by the payer's institution after processing (requires amount, fee, currency, transferType). An expired transaction is refused with 404 ERR_TRANSACTION_EXPIRED. Repeating the identical EXECUTING returns 200 with no side effects, so it is safe to retry on a timeout; a different one is 409 ERR_EXECUTION_MISMATCH.
- **CONFIRMED**: the Merchant Leg has completed. Accepted at any time after EXECUTING, with no time-to-live check.
- **FAILED**: the Merchant Leg was rejected (requires statusMessage; feeLegOutcome after a DEFERRED lock). No fee is earned.
- **DECLINED**: the payer declined, before the lock (requires statusMessage).
- **CANCELLED**: only for a transaction your institution initiated, before the lock (requires statusMessage).
After EXECUTING, DECLINED and CANCELLED are refused with 409 ERR_ALREADY_PROCESSED.

**transferType:** INSTANT (an instant credit transfer), INTERNAL (the payee's account is with your institution) or DEFERRED (a credit transfer that settles later, which can take days). DEFERRED only for a transaction whose process response carries \`deferredAllowed: true\`; otherwise 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED.

**fee**: the amount of the Fee Leg, payware's fee plus VAT where it applies (\`feeVat\` in the process response shows the VAT part). payware calculates it, the institution transfers it in full to payware's fee account. Echo the \`fee\` from the process response verbatim - do not recompute it from \`feeFixed\`/\`feeRate\` and do not re-round it, or the call is rejected with ERR_FEE_MISMATCH. Currency must match the processing currency of the transaction.

**API Request Structure:**
\`\`\`json
{
  "status": "EXECUTING",
  "amount": "112.00",
  "currency": "EUR",
  "fee": "1.34",
  "transferType": "INSTANT"
}
\`\`\`
then, once the Merchant Leg has completed:
\`\`\`json
{
  "status": "CONFIRMED"
}
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "The pw transaction id. After processing a product, placement, soundbite or POI id, it is the transactionId of the process response: payware looks the id up as given, so a pr, pl, ps or pi id is not found. Up to 32 characters.",
        pattern: "^pw[0-9A-Za-z]{8,30}$"
      },
      status: {
        type: "string",
        enum: FINALIZE_STATUSES,
        description: "EXECUTING immediately before money moves (payware checks everything and locks; a refusal means nothing moves). CONFIRMED only once the Merchant Leg has completed, or FAILED if it was rejected - both only after EXECUTING, otherwise 409 ERR_NOT_EXECUTING. DECLINED (the payer declined) or CANCELLED (a transaction your institution initiated) before the lock."
      },
      statusMessage: {
        type: "string",
        description: "Transaction failure/cancellation reason (required for CANCELLED, DECLINED, FAILED)",
        maxLength: 100
      },
      amount: {
        type: ["number", "string"],
        description: "The payer amount, the same value sent at the process step. Required for EXECUTING. Optional for CONFIRMED, where it must equal the locked value (409 ERR_EXECUTION_MISMATCH).",
        minimum: 0.01,
        maximum: 9999999999999.99
      },
      fee: {
        type: ["number", "string"],
        description: "The amount of the Fee Leg: payware's fee plus VAT where it applies. Echo back the `fee` value from the process/get response EXACTLY - payware calculates it and the institution transfers it in full to payware's fee account. Do not recompute it from feeFixed/feeRate and do not re-round it; it already carries the currency's smallest payable unit (2 decimals for EUR/USD, 0 for JPY, 3 for KWD). A recomputed value is rejected with ERR_FEE_MISMATCH. Required for EXECUTING; use 0 when no fee applies. Optional for CONFIRMED, where it must equal the locked value.",
        minimum: 0,
        maximum: 9999999999999.99
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        description: "Transaction currency, which must match the processing currency. Required for EXECUTING; optional for CONFIRMED, where it must equal the locked value."
      },
      transferType: {
        type: "string",
        enum: TRANSFER_TYPES,
        description: "How the Merchant Leg moves. Required with EXECUTING (400 ERR_MISSING_TRANSFER_TYPE). INSTANT: an instant credit transfer, complete on the receiving bank's confirmation. INTERNAL: the payee's account is with your institution, complete when credited. DEFERRED: a credit transfer that settles later, which can take days; allowed only when the process response carries deferredAllowed: true, otherwise 400 ERR_DEFERRED_TRANSFER_NOT_ALLOWED. With DEFERRED the Fee Leg goes together with the Merchant Leg; with INSTANT and INTERNAL it goes after CONFIRMED. Optional with CONFIRMED, where it must equal the locked value."
      },
      feeLegOutcome: {
        type: "string",
        enum: FEE_LEG_OUTCOMES,
        description: "With FAILED only: what happened to the Fee Leg. NOT_EXECUTED: it never left. RETURNED: it went with a DEFERRED Merchant Leg and you returned it to the payer. Required with FAILED after a DEFERRED lock (400 ERR_MISSING_FEE_LEG_OUTCOME). RETURNED is invalid after an INSTANT or INTERNAL lock (400 ERR_INVALID_FEE_LEG_OUTCOME), where the Fee Leg is executed only after CONFIRMED."
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
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["transactionId", "status"]
  },

  async handler(args) {
    const {
      transactionId,
      status,
      statusMessage,
      amount,
      fee,
      currency,
      transferType,
      feeLegOutcome,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    // The same checks finalizeTransaction runs, here so that a bad status fails before the
    // credential checks below.
    checkFinalizeArgs({ transactionId, status, statusMessage, amount, fee, currency, transferType, feeLegOutcome });

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }

    const result = await finalizeTransaction({
      transactionId,
      status,
      statusMessage,
      amount,
      fee,
      currency,
      transferType,
      feeLegOutcome,
      partnerId,
      privateKey,
      useSandbox
    });
    // The success text quotes the endpoint. The helper above keeps its own baseUrl, so it needs one here.
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

    if (result.success) {
      const statusEmojis = {
        EXECUTING: '🔒',
        CONFIRMED: '✅',
        CANCELLED: '🚫',
        DECLINED: '❌',
        FAILED: '💥'
      };

      const statusEmoji = statusEmojis[status] || '📄';
      // The response names the locked transfer type; a CONFIRMED sent with the status alone does not.
      const lockedTransferType = result.transaction?.transferType || transferType;
      const shownFee = result.transaction?.fee ?? fee;
      const shownCurrency = result.transaction?.currency ?? currency ?? '';

      return {
        content: [{
          type: "text",
          text: `${statusEmoji} **${status === 'EXECUTING' ? 'Transaction Locked for Execution' : 'Transaction Finalized Successfully'}**

**Transaction ID:** ${transactionId}
**Status:** ${status}

**Details:**
${statusMessage ? `- Status Message: ${statusMessage}` : ''}
${amount ? `- Amount: ${amount} ${currency || ''}` : ''}
${shownFee !== undefined && shownFee !== null ? `- Fee Leg: ${shownFee} ${shownCurrency}${result.transaction?.feeVat !== undefined ? ` (VAT included: ${result.transaction.feeVat})` : ''}` : ''}
${lockedTransferType ? `- Transfer Type: ${lockedTransferType}` : ''}
${feeLegOutcome ? `- Fee Leg Outcome: ${feeLegOutcome}` : ''}
${result.transaction?.paymentMethod ? `- Payment Method: ${result.transaction.paymentMethod}` : ''}

**Transaction Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: PATCH ${baseUrl}/transactions/${transactionId}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Callbacks:**
${status === 'EXECUTING'
  ? '- None: EXECUTING sends no callback. The merchant still sees the transaction as ACTIVE'
  : `- **TRANSACTION_FINALIZED** callback sent to all parties
- Transaction moved to historical records
- Final status permanently recorded`}

**Next Steps:**
${nextStepsFor(status, lockedTransferType, statusMessage)}

**⚠️ Important:**
${status === 'EXECUTING'
  ? `- The lock is not final: send CONFIRMED once the Merchant Leg has completed, or FAILED if it was rejected
- payware never closes a lock itself. Still EXECUTING after 60 seconds (INSTANT, INTERNAL) or two TARGET2 business days (DEFERRED), it is flagged to payware support, who will ask you for the outcome
- DECLINED and CANCELLED are no longer accepted (409 ERR_ALREADY_PROCESSED)`
  : `- Transaction finalization is **permanent** and cannot be reversed
- This transaction is now complete in the payware system`}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Finalization Failed**

**Transaction ID:** ${transactionId}
**Attempted Status:** ${status}
${status === 'EXECUTING' ? `\n**${lockRefusalNote(result.error)}**\n` : ''}
**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Finalization Issues:**
1. **ERR_MISSING_TRANSACTION**: Transaction ID not found. **ERR_TRANSACTION_EXPIRED** (also 404): the time to live ran out before EXECUTING arrived, and the transaction is closed as unpaid
2. **ERR_TRANSACTION_NOT_PROCESSED**: Transaction hasn't been processed yet
3. **ERR_NOT_EXECUTING** (409): CONFIRMED or FAILED sent while the transaction is still ACTIVE - send EXECUTING first, before any money moves
4. **ERR_EXECUTION_MISMATCH** (409): a repeated EXECUTING with a different body, or a CONFIRMED whose amount, fee, currency or transferType differs from the lock
5. **ERR_ALREADY_PROCESSED** (409): already final, or DECLINED/CANCELLED after EXECUTING
6. **ERR_MISSING_TRANSFER_TYPE** / **ERR_INVALID_TRANSFER_TYPE**: EXECUTING needs transferType INSTANT, INTERNAL or DEFERRED
7. **ERR_DEFERRED_TRANSFER_NOT_ALLOWED**: DEFERRED on a transaction without deferredAllowed: true
8. **ERR_MISSING_FEE_LEG_OUTCOME** / **ERR_INVALID_FEE_LEG_OUTCOME**: FAILED after a DEFERRED lock needs feeLegOutcome; RETURNED is invalid after INSTANT or INTERNAL
9. **ERR_FEE_MISMATCH**: the fee was recomputed or re-rounded instead of echoed from the process response
10. **ERR_FEE_CONFIGURATION_UNAVAILABLE** / **ERR_MISSING_EXCHANGE_RATE** (503): payware could not check the fee; nothing was applied, so retrying EXECUTING later is safe
11. **ERR_INVALID_STATUS**, **ERR_MISSING_STATUS_MESSAGE**, **ERR_SPECIFYING_CURRENCY_NOT_ALLOWED**, **ERR_INVALID_AMOUNT**, **ERR_UNAUTHORIZED_OPERATION**

**Troubleshooting:**
1. Verify transaction ID is correct: the pw id (up to 32 characters); this endpoint looks the id up as given, so a pr, pl, ps or pi id is not found: use the transactionId of the process response
2. Ensure transaction has been processed first
3. Send EXECUTING (amount, fee, currency, transferType) before any money moves, then CONFIRMED or FAILED
4. Provide statusMessage for CANCELLED, DECLINED and FAILED
5. Verify you are authorized to finalize this transaction: after a lock only the payer's institution may complete it
6. Ensure currency matches the original transaction currency`
        }]
      };
    }
  }
};
