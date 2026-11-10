import axios from 'axios';
import { createJWTForPartner } from '../../core/auth/jwt-factory.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';
import { READS } from '../../shared/tool-annotations.js';
import { transactionSummary } from '../../shared/transaction-summary.js';

/**
 * Get transaction status from payware API as an ISV
 * @param {Object} params - Parameters for status request
 * @returns {Object} Transaction status response
 */
export async function getTransactionStatus({ transactionId, merchantPartnerId, oauth2Token, useSandbox = true }) {
  if (!transactionId) {
    throw new Error('Transaction ID is required');
  }

  if (!merchantPartnerId) {
    throw new Error('Merchant Partner ID is required for ISV operations');
  }

  if (!oauth2Token) {
    throw new Error('OAuth2 token is required for ISV operations');
  }

  // Get ISV credentials
  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);

  // Create ISV JWT token (GET request - no body)
  const jwtData = await createJWTForPartner({
    partnerId: isvPartnerId,
    privateKey,
    requestBody: null,
    merchantId: merchantPartnerId,
    oauth2Token
  });

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${jwtData.token}`,
    'Content-Type': 'application/json',
    'Api-Version': '1'  // Required: current API version
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.get(`${baseUrl}/transactions/${transactionId}`, { headers });

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
 * Format transaction status for display
 */
function formatTransactionStatus(transaction) {
  const statusEmojis = {
    'ACTIVE': '⏳'
  };

  // If a transaction is returned from GET /transactions/{id}, it's always ACTIVE
  // (transactions with final statuses are only available via /transactions-history)
  const status = transaction.status || 'ACTIVE';
  const emoji = statusEmojis[status] || '⏳';

  return {
    emoji,
    status,
    formatted: `${emoji} ${status}`
  };
}

/**
 * Get transaction status tool implementation for ISV
 */
export const getTransactionStatusTool = {
  name: "payware_operations_get_transaction_status",
  annotations: READS,
  description: `Get status of an ACTIVE transaction by ID as an ISV on behalf of a merchant.

**ISV Authentication:** Uses ISV JWT with merchant partner ID in 'aud' claim and OAuth2 token in 'sub' claim.
**Endpoint:** GET /transactions/{transactionId}
**Use Case:** Check status of ACTIVE transactions only. This endpoint only returns transactions with ACTIVE status.
**Note:** For transactions with final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED), use 'payware_operations_get_transaction_history' instead.

**Required:** Merchant Partner ID and OAuth2 token for ISV authentication.

⏳ **ACTIVE can outlast \`timeToLive\`. Never infer EXPIRED from the clock.** Once the payer's institution has
started the payment (it locks the transaction immediately before the money moves, which you do not see),
the transaction stays ACTIVE past \`timeToLive\` until the money has moved: seconds for an instant or
internal transfer, days for a deferred one (a transaction created with \`deferredAllowed: true\`). Its
\`timeToLive\` then stops at the value it had when the payment started. Keep polling, or wait for the
callback: a transaction is EXPIRED only when payware says so, in the callback or in transaction history,
and one that is no longer returned here has a final status there.

🛍️ **Product-originated transactions carry a nested \`product\` object** (productId, type, name,
descriptions, imageUrl, imageDigest, imageContentType, imageBytes, termsUrl, termsText, regularPrice,
shippable, quickPay, shopName). Since 2026-07-22 these are grouped under \`product\` instead of sitting
flat - the old top-level \`imageUrl\` is gone. Discriminate by the presence of the object. Verify
\`imageDigest\` (SHA-256, pinned by payware) before rendering the image to a payer; \`regularPrice\` is
display-only and appears only when higher than \`amount\`. The top-level \`amount\` and \`currency\` are
authoritative and are not repeated inside the object.

⚠️ **The MERCHANT's plan governs.** An on-behalf call inherits the acting merchant's plan, so this
answers **403** for a **Basic** merchant. Which presentation fields come back also follows that plan:
\`imageUrl\` and \`termsUrl\` are Standard and above.

💰 **Amounts follow the currency, not a fixed two decimals.** Parse them with a decimal type and never
compare them as strings.`,

  inputSchema: {
    type: "object",
    required: ["transactionId", "merchantPartnerId", "oauth2Token"],
    properties: {
      transactionId: {
        type: "string",
        description: "Transaction ID to check status for"
      },
      merchantPartnerId: {
        type: "string",
        description: "Partner ID of the target merchant (8 alphanumeric characters, e.g., 'PZAYNMVE')"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token obtained from the merchant"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    }
  },

  async handler(args) {
    const { transactionId, merchantPartnerId, oauth2Token, useSandbox = true } = args;

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    if (!merchantPartnerId) {
      throw new Error("Merchant Partner ID is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("OAuth2 token is required for ISV operations");
    }

    const result = await getTransactionStatus({ transactionId, merchantPartnerId, oauth2Token, useSandbox });

    if (result.success) {
      const statusInfo = formatTransactionStatus(result.transaction);

      return {
        content: [{
          type: "text",
          text: `📊 **Transaction Status Retrieved (ISV -> Merchant: ${merchantPartnerId})**

**Transaction:** ${transactionId}
**Status:** ${statusInfo.formatted}

**ISV Integration:**
- ISV Partner: ${getPartnerIdSafe()}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**Transaction Details:**
${transactionSummary(result.transaction)}

**Full Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**Request ID:** ${result.requestId || 'N/A'}
**Timestamp:** ${result.timestamp}

**Status Meanings:**
- ⏳ ACTIVE: pending - not yet paid, or paid by the payer's institution with the money still moving. It can stay ACTIVE past \`timeToLive\` (seconds for an instant transfer, days with \`deferredAllowed\`), so never treat it as expired from the clock

**Note:** Only ACTIVE transactions are returned by this endpoint. For final statuses (CONFIRMED, DECLINED, FAILED, EXPIRED, CANCELLED), use the transaction history tool.`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Transaction Status**

**Transaction ID:** ${transactionId}
**ISV -> Merchant:** ${getPartnerIdSafe()} -> ${merchantPartnerId}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**ISV-Specific Troubleshooting:**
1. Verify OAuth2 token is valid and granted for merchant
2. Ensure merchant partner ID is correct (8 characters)
3. Check if ISV has authorization to access merchant transactions
4. Verify transaction belongs to the specified merchant
5. Confirm JWT token is properly signed for ISV requests

**General Troubleshooting:**
1. Verify the transaction ID is correct
2. Check if transaction exists and is accessible
3. Ensure transaction is still ACTIVE (not finalized)
4. Try using transaction history tool for completed transactions`
        }]
      };
    }
  }
};