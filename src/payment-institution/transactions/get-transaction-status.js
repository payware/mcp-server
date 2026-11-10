import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';

/**
 * Get transaction status via payware API (active transactions)
 * @param {Object} params - Transaction status parameters
 * @returns {Object} Transaction status response
 */
export async function getPITransactionStatus({
  transactionId,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  // Create JWT token for GET request (no contentSha256 needed for GET)
  const tokenData = createJWTToken(partnerId, privateKey, null);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions/${transactionId}`, {
      headers
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
 * Get payment institution transaction status tool implementation
 */
export const getPITransactionStatusTool = {
  name: "payware_operations_get_transaction_status",
  annotations: READS,
  description: `Get the current status of a pending payware transaction as a financial institution: ACTIVE, or EXECUTING once your institution has locked it.

**Use Cases:**
- Check transaction status and details
- Monitor transaction progress
- Get participant information (payee account, friendly names, BICs)
- Check remaining time to live
- Fetch what to display to the payer for a product-originated transaction

**Response includes:**
- Transaction ID and type
- Payee account, friendly names and BICs (payware does not keep the payer's account)
- Transaction amount and currency
- Reason lines and creation timestamp
- Remaining time to live
- Current transaction state: ACTIVE, or EXECUTING after your institution's EXECUTING finalize
- \`deferredAllowed: true\` when the merchant opted this transaction in to a deferred Merchant Leg (absent otherwise); only then may EXECUTING carry \`transferType: DEFERRED\`
- \`product\` - payer-facing presentation, for product-originated transactions only (see below)

🔒 **EXECUTING.** Only the payer's institution sees this status, between its EXECUTING finalize (the lock, sent immediately before money moves) and its CONFIRMED or FAILED. A locked transaction has left the expiry clock: it does not expire, and payware accepts its CONFIRMED (once the Merchant Leg has completed) or FAILED at any time. A merchant or ISV reading it sees ACTIVE, and no callback is sent until it is final.

🛍️ **The nested \`product\` object.** Since 2026-07-22 the presentation fields are grouped under
\`product\` rather than sitting flat on the response - the old top-level \`imageUrl\` is gone.
Discriminate a product-originated transaction by the **presence of the object**, not by probing
individual fields. It carries: \`productId\`, \`type\`, \`name\`, \`shortDescription\`, \`longDescription\`,
\`imageUrl\`, \`imageDigest\`, \`imageContentType\`, \`imageBytes\`, \`termsUrl\`, \`termsText\`,
\`regularPrice\`, \`shippable\`, \`quickPay\`, \`shopName\`. Absent properties are omitted.

Four rules a payer-facing app must follow:

1. **Verify \`imageDigest\` before rendering.** It is the SHA-256 payware pinned for the image at
   \`imageUrl\`. Fetch the image, check its bytes against this digest, and fall back to a neutral
   placeholder on mismatch. Rendering an unverified image to a payer is how a compromised merchant
   image host puts arbitrary content on a payment confirmation screen. \`imageContentType\` and
   \`imageBytes\` are what payware observed on fetch - use them to reject a surprise.
2. **\`amount\` and \`currency\` at the top level are authoritative** - they are what the payer pays.
   The \`product\` object does not repeat them. \`regularPrice\` is the pre-discount list price and is
   present **only when it is higher than \`amount\`**, i.e. when there is a genuine saving to show; it
   is omitted otherwise, precisely so no misleading comparison can be displayed.
3. **\`quickPay\` is advisory.** When true, the app may skip the product detail screen and go straight
   to payment confirmation - but only if it still shows the payee name, amount and currency, and
   still gives the payer access to the terms in full before they authorise.
4. **A missing field is usually a plan boundary, not an error.** \`imageUrl\` and \`termsUrl\` are
   Standard and above; \`termsText\` and the descriptions are universal.

For a \`pr\`, \`pl\` or \`ps\` identifier the values are resolved live (product -> shop -> merchant fallback, then
plan gating); for the resulting \`pw\` transaction they are the snapshot frozen at creation, so what
you get always reflects what the payer could have been shown at scan time.

💰 **Amounts follow the currency.** \`amount\`, \`fee\`, \`feeVat\`, \`payerAmount\` and \`payeeAmount\` are
decimal strings at the smallest unit their own currency can be paid in - not always two decimals. \`fee\` is
the Fee Leg: payware's fee plus VAT where it applies (\`feeVat\` states the VAT). The payer approves one
payment with two payees, the merchant's net amount and the Fee Leg to \`feeAccount\` (payware's account with
your institution, \`account\` in your institution's format). \`fee\` is **the value to echo back unchanged at
finalize**; \`feeFixed\` and \`feeRate\` are informational, and recomputing the fee from them is rejected
with ERR_FEE_MISMATCH.

**Note:** This endpoint only returns pending transactions (ACTIVE or EXECUTING); once final it answers 404. Use \`payware_operations_get_transaction_history\` for completed/expired transactions.`,
  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "The id to look up: 'pw' (a transaction), 'pr' (product), 'pl' (placement: pays as its product, and the payment is attributed to the placement), 'ps' (soundbite) or 'pi' (a POI: its pending price as transaction data). Up to 32 characters (identifiers may grow beyond today's 10).",
        pattern: "^(pw|pr|pl|ps|pi)[0-9A-Za-z]{8,30}$"
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
    required: ["transactionId"]
  },

  async handler(args) {
    const {
      transactionId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error(`Private key is required. Provide via 'privateKey' parameter or set ${privateKeyVariable(args.useSandbox ?? true)}.`);
    }

    const result = await getPITransactionStatus({
      transactionId,
      partnerId,
      privateKey,
      useSandbox
    });
    // The success text quotes the endpoint. The helper above keeps its own baseUrl, so it needs one here.
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

    if (result.success) {
      const tx = result.transaction;
      const createdDate = tx.created ? new Date(tx.created).toISOString() : 'N/A';
      // EXECUTING reaches only the payer's institution; everything else pending reads ACTIVE.
      const locked = tx.status === 'EXECUTING';

      // Transaction type display
      const typeDisplay = tx.transactionType || 'DEFAULT';
      const initiatorDisplay = tx.initiatedBy || 'UNKNOWN';

      return {
        content: [{
          type: "text",
          text: `📊 **Payment Institution Transaction Status**

**Transaction Information:**
- ID: ${tx.transactionId || transactionId}
- Type: ${typeDisplay}
- Initiated By: ${initiatorDisplay}
- Status: ${locked ? '🔒 EXECUTING' : '⏳ ACTIVE'}
- Created: ${createdDate}
- Remaining TTL: ${locked ? 'not running (locked)' : `${tx.timeToLive || 'N/A'} seconds`}
${tx.transferType ? `- Transfer Type: ${tx.transferType}\n` : ''}${tx.deferredAllowed === true ? '- Deferred Merchant Leg allowed: yes (transferType DEFERRED may be sent at EXECUTING)\n' : ''}
**Transaction Details:**
- Amount: ${tx.amount || 'N/A'} ${tx.currency || 'N/A'}
${tx.paymentMethod ? `- Payment Method: ${tx.paymentMethod}\n` : ''}- Reason L1: ${tx.reasonL1 || 'N/A'}
${tx.reasonL2 ? `- Reason L2: ${tx.reasonL2}` : ''}
${tx.fee !== undefined && tx.fee !== null ? `
**Fee Leg:**
- Amount: ${tx.fee} ${tx.currency || ''} (VAT included: ${tx.feeVat ?? '0'})
- To: ${tx.feeAccount ? `${tx.feeAccount.account}, ${tx.feeAccount.name}${tx.feeAccount.bic ? `, ${tx.feeAccount.bic}` : ''}` : (Number(tx.fee) > 0 ? 'no fee account configured for your institution' : 'no Fee Leg')}
` : ''}
**Payee Information:**
- Account: ${tx.payeeAccount || 'N/A'}
- Friendly Name: ${tx.payeeFriendlyName || 'N/A'}
- Registered Name: ${tx.payeeRegisteredName || 'N/A'}
${tx.payeeRegisteredId ? `- Registered ID: ${tx.payeeRegisteredId}\n` : ''}${tx.payeeVatId ? `- VAT ID: ${tx.payeeVatId}\n` : ''}- BIC: ${tx.payeeBIC || 'N/A'}

**Payer Information:**
- Friendly Name: ${tx.payerFriendlyName || 'N/A'}
- BIC: ${tx.payerBIC || 'N/A'}

**Full API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: GET ${baseUrl}/transactions/${transactionId}
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
${locked
  ? `1. The lock is yours: complete the Merchant Leg
2. Use \`payware_operations_finalize_transaction\` with CONFIRMED (the status alone is enough) once it has completed, or FAILED if it was rejected${tx.transferType === 'DEFERRED' ? ' (with feeLegOutcome)' : ''}`
  : `1. Process it if your institution has not yet
2. ${tx.timeToLive && parseInt(tx.timeToLive) < 60 ? '⚠️ Transaction expires soon!' : 'Monitor remaining TTL'}
3. Use \`payware_operations_process_transaction\` if you need to process this transaction
4. Use \`payware_operations_finalize_transaction\` with EXECUTING immediately before money moves, then CONFIRMED once the Merchant Leg has completed (or DECLINED if the payer declines before the lock)`}

**⚠️ Transaction State:**
${locked
  ? `- **Locked** for execution by the payer's institution
- It does not expire; DECLINED and CANCELLED are no longer accepted
- The merchant sees it as ACTIVE until CONFIRMED or FAILED`
  : `- This is an **active** transaction
- Participants can still interact with it
- Will expire in ${tx.timeToLive || 'unknown'} seconds unless your institution's EXECUTING is accepted first`}`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Transaction Status Check Failed**

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

**Common Issues:**
1. **ERR_MISSING_TRANSACTION (404)**: Transaction not found, expired, or already completed (CONFIRMED and FAILED are no longer pending)
2. **Invalid Transaction ID**: Check transaction ID format (a 2-letter prefix and up to 30 more characters)
3. **Authentication Issues**: Verify JWT token and partner credentials

**Troubleshooting:**
1. Verify transaction ID is correct: up to 32 characters, starts with 'pw' (standard), 'pr' (product), 'pl' (placement), 'ps' (soundbite) or 'pi' (POI)
2. Check if transaction has expired or been completed
3. Use \`payware_operations_get_transaction_history\` for completed/expired transactions
4. Verify your partner credentials and API access
5. Ensure transaction was created or you have access to it

**Alternative Actions:**
- If transaction is completed: Use \`payware_operations_get_transaction_history\`
- If transaction ID is wrong: Verify the correct transaction ID
- If access issues: Check your payment institution credentials`
        }]
      };
    }
  }
};