import { deleteTransactionDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Delete deep link for a transaction (ISV on behalf of merchant)
 */
export const deleteTransactionLinkTool = {
  name: "payware_deep_links_delete_transaction_link",
  description: `Delete an active deep link for a transaction on behalf of a merchant. Once deleted, the deep link URL will no longer redirect to the payware mobile app.

**ISV Authentication:**
- Requires ISV JWT token with merchant partner ID in 'aud' claim
- Requires OAuth2 token in 'sub' claim

**Use Cases:**
- Remove expired transaction links
- Clean up after transaction completion
- Security cleanup for sensitive transactions

**Important Notes:**
- Deep links are only supported in production environment
- Once deleted, the link cannot be recovered - you'll need to create a new one
- This operation is irreversible`,

  inputSchema: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "The transaction identifier (e.g., 'pw7e4rCToG')",
        pattern: "^[a-zA-Z0-9]+$"
      },
      merchantPartnerId: {
        type: "string",
        description: "Partner ID of the merchant for whom the transaction is being deleted"
      },
      oauth2Token: {
        type: "string",
        description: "OAuth2 access token for merchant authorization"
      },
      isvPartnerId: {
        type: "string",
        description: "ISV Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "ISV RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      }
    },
    required: ["transactionId", "merchantPartnerId", "oauth2Token"]
  },

  async handler(args) {
    const {
      transactionId,
      merchantPartnerId,
      oauth2Token,
      isvPartnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe()
    } = args;

    if (!transactionId) {
      throw new Error("transactionId is required");
    }

    if (!merchantPartnerId) {
      throw new Error("merchantPartnerId is required for ISV operations");
    }

    if (!oauth2Token) {
      throw new Error("oauth2Token is required for ISV operations");
    }

    if (!isvPartnerId) {
      throw new Error("ISV Partner ID is required. Provide via 'isvPartnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    try {
      const result = await deleteTransactionDeepLink({
        transactionId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Transaction Deep Link Deleted (ISV)**

**Deletion Details:**
- Transaction ID: ${transactionId}
- Merchant: ${merchantPartnerId}
- Status: Successfully deleted
- Link URL: https://go.payware.eu/${transactionId} (now inactive)

**ISV Authentication:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 10)}...

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
          text: `❌ **Failed to Delete Transaction Deep Link (ISV)**

**Error Details:**
- Transaction ID: ${transactionId}
- Merchant: ${merchantPartnerId}
- Message: ${error.message}

**Common Issues:**
1. **Link not found**: Deep link may already be deleted or never existed
2. **Authentication failed**: Verify ISV partner ID, private key, and OAuth2 token
3. **Authorization failed**: Ensure OAuth2 token authorizes access to merchant
4. **Sandbox environment**: Deep links are production-only
5. **Invalid transaction ID**: Ensure transaction ID format is correct

**Troubleshooting:**
1. Check if deep link exists using \`payware_deep_links_get_transaction_link\`
2. Check OAuth2 token is valid and not expired
3. Ensure ISV has permission to access merchant data
4. Verify running in production environment
5. Ensure JWT authentication is working`
        }]
      };
    }
  }
};