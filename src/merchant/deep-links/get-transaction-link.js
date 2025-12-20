import { getTransactionDeepLink } from '../../shared/deep-links/api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Get deep link for a merchant transaction
 */
export const getTransactionLinkTool = {
  name: "payware_deep_links_get_transaction_link",
  description: `Get an active deep link for a transaction. Returns a clickable URL that redirects to the payware mobile app.

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
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
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
      const result = await getTransactionDeepLink({
        transactionId,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      // Extract the URL - API returns either string directly or object with link property
      const linkUrl = typeof result.data === 'string' ? result.data : (result.data.link || result.data)

      return {
        content: [{
          type: "text",
          text: `🔗 **Transaction Deep Link Retrieved**

**Deep Link Details:**
- Transaction ID: ${transactionId}
- Web URL: ${linkUrl}
- Mobile Redirect: payware://${transactionId}

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
          text: `❌ **Failed to Get Transaction Deep Link**

**Error Details:**
- Transaction ID: ${transactionId}
- Message: ${error.message}

**Common Issues:**
1. **Transaction not found**: Check if transaction exists and is not expired
2. **Authentication failed**: Verify partner ID and private key
3. **Sandbox environment**: Deep links are production-only
4. **Invalid transaction ID**: Ensure transaction ID format is correct

**Troubleshooting:**
1. Verify transaction exists using \`payware_transactions_get_transaction_status\`
2. Check if running in production environment
3. Ensure JWT authentication is working
4. Confirm transaction is not expired`
        }]
      };
    }
  }
};