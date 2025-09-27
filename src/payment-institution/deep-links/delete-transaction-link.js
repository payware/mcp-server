import { deleteTransactionDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Delete deep link for a payment institution transaction
 */
export const deleteTransactionLinkTool = {
  name: "payware_deep_links_delete_transaction_link",
  description: `Delete an active deep link for a transaction where the payment institution acts as source (SRC) or destination (DST). Once deleted, the deep link URL will no longer redirect to the payware mobile app.

**Use Cases:**
- Remove expired transaction links
- Clean up after transaction completion
- Security cleanup for sensitive P2P transactions

**Important Notes:**
- Deep links are only supported in production environment
- Once deleted, the link cannot be recovered - you'll need to create a new one
- Payment institutions only manage transaction links (no product links)
- This operation is irreversible`,

  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "The transaction identifier (e.g., 'pw7e4rCToG')",
        pattern: "^[a-zA-Z0-9]+$"
      },
      partnerId: {
        type: "string",
        description: "Payment Institution Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["transactionId"]
  },

  async handler(args) {
    const {
      transactionId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!transactionId) {
      throw new Error("transactionId is required");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    try {
      const result = await deleteTransactionDeepLink({
        transactionId,
        partnerType: 'payment_institution',
        partnerId,
        privateKey
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Transaction Deep Link Deleted (Payment Institution)**

**Deletion Details:**
- Transaction ID: ${transactionId}
- Status: Successfully deleted
- Link URL: https://url.payware.eu/${transactionId} (now inactive)

**Payment Institution Info:**
- Partner ID: ${partnerId}
- Role: SRC/DST for P2P transactions

**API Call Details:**
- Endpoint: DELETE ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}
- Method: ${result.requestInfo.method}

**Result:**
- The deep link is no longer active
- Mobile redirects will no longer work
- URL will return an error if accessed

**Important Notes:**
⚠️ This operation is irreversible
⚠️ Create a new link if needed using \`payware_deep_links_get_transaction_link\`
⚠️ Any existing shared links will stop working immediately`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Delete Transaction Deep Link (Payment Institution)**

**Error Details:**
- Transaction ID: ${transactionId}
- Message: ${error.message}

**Common Issues:**
1. **Link not found**: Deep link may already be deleted or never existed
2. **Authentication failed**: Verify partner ID and private key
3. **Authorization failed**: Ensure PI is SRC or DST for this transaction
4. **Sandbox environment**: Deep links are production-only
5. **Invalid transaction ID**: Ensure transaction ID format is correct

**Troubleshooting:**
1. Check if deep link exists using \`payware_deep_links_get_transaction_link\`
2. Verify running in production environment
3. Ensure JWT authentication is working
4. Confirm payment institution role in transaction
5. Ensure transaction ID is correct`
        }]
      };
    }
  }
};