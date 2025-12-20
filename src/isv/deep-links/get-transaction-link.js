import { getTransactionDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get deep link for a transaction (ISV on behalf of merchant)
 */
export const getTransactionLinkTool = {
  name: "payware_deep_links_get_transaction_link",
  description: `Get an active deep link for a transaction on behalf of a merchant. Returns a clickable URL that redirects to the payware mobile app.

**ISV Authentication:**
- Requires ISV JWT token with merchant partner ID in 'aud' claim
- Requires OAuth2 token in 'sub' claim

**Deep Link Format:**
- Web URL: https://go.payware.eu/{transactionId}
- Mobile Redirect: payware://{transactionId}

**Use Cases:**
- P2P payments via messaging services
- Mobile-only e-commerce payments
- Advertisement references

**Important Notes:**
- Deep links are only supported in production environment
- Link expiration is synchronized with the referenced transaction
- Traditional deep links that route to app content when app is installed`,

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
        description: "Partner ID of the merchant for whom the transaction is being retrieved"
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
      const result = await getTransactionDeepLink({
        transactionId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token
      });

      // Extract the URL - API returns either string directly or object with link property
      const linkUrl = typeof result.data === 'string' ? result.data : (result.data.link || result.data)

      return {
        content: [{
          type: "text",
          text: `🔗 **Transaction Deep Link Retrieved (ISV)**

**Deep Link Details:**
- Transaction ID: ${transactionId}
- Merchant: ${merchantPartnerId}
- Web URL: ${linkUrl}
- Mobile Redirect: payware://${transactionId}

**ISV Authentication:**
- ISV Partner ID: ${isvPartnerId}
- Merchant Partner ID: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 10)}...

**Link Information:**
- Status: Active
- Expiration: Synchronized with transaction
- Platform: Production only

**API Response:**
\`\`\`json
${JSON.stringify(result.data, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: GET ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}
- Method: ${result.requestInfo.method}

**Usage:**
1. Share the web URL: \`${linkUrl}\`
2. On mobile devices, it will redirect to: \`payware://${transactionId}\`
3. Link expires when the transaction expires
4. Recreate if transaction is extended`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Transaction Deep Link (ISV)**

**Error Details:**
- Transaction ID: ${transactionId}
- Merchant: ${merchantPartnerId}
- Message: ${error.message}

**Common Issues:**
1. **Transaction not found**: Check if transaction exists and is not expired
2. **Authentication failed**: Verify ISV partner ID, private key, and OAuth2 token
3. **Authorization failed**: Ensure OAuth2 token authorizes access to merchant
4. **Sandbox environment**: Deep links are production-only
5. **Invalid transaction ID**: Ensure transaction ID format is correct

**Troubleshooting:**
1. Verify transaction exists using \`payware_transactions_get_transaction_status\`
2. Check OAuth2 token is valid and not expired
3. Ensure ISV has permission to access merchant data
4. Check if running in production environment
5. Ensure JWT authentication is working`
        }]
      };
    }
  }
};