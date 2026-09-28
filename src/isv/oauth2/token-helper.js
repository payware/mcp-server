/**
 * OAuth2 Token Helper Utility
 * Helps users manage OAuth2 tokens more easily
 */

import { obtainTokenTool } from './obtain-token.js';
import { getTokenInfoTool } from './get-token-info.js';

/**
 * Helper tool to create or find OAuth2 tokens with clear output
 */
export const tokenHelperTool = {
  name: 'payware_authorization_oauth2_token_helper',
  description: `OAuth2 Token Helper - Create or manage tokens with clear output.

This tool helps you:
1. Create new OAuth2 tokens (if none exists)
2. Guide you on finding existing tokens
3. Display token information clearly

Use this when you need a token but aren't sure if one exists or what it is.`,

  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'help'],
        default: 'create',
        description: 'Action to perform: create (attempt to create token) or help (show guidance)'
      },
      clientId: {
        type: 'string',
        description: 'Merchant Partner ID (defaults to PAYWARE_OAUTH_CLIENT_ID env var)'
      },
      clientSecret: {
        type: 'string',
        description: 'Merchant Secret (defaults to PAYWARE_OAUTH_CLIENT_SECRET env var)'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ action = 'create', clientId, clientSecret, useSandbox = true }) {
    if (action === 'help') {
      return {
        content: [{
          type: 'text',
          text: `📋 **OAuth2 Token Management Help**

🔑 **About OAuth2 Tokens:**
- Requesting a token again for the same merchant returns the existing one, not a second one
- Tokens requested this way expire 180 days after the merchant grants authorization
- Rotate with POST /oauth2/tokens/{token}/rotate - works on expired tokens too, no merchant consent needed
- Token status: PENDING → GRANTED (after merchant approval); REVOKED is final

🎯 **To get your token:**

**Option 1: Request a token**
Use: \`payware_authorization_oauth2_obtain_token\`
- Returns a new PENDING token, or the existing token if this merchant already has one
- On failure the server names the reason (e.g. client not found, client disabled)

**Option 2: Check a known token**
Use: \`payware_authorization_oauth2_get_token_info\` with your saved token
- Shows current status (PENDING/GRANTED/REVOKED) and expiry

**Option 3: If you lost the token**
Nothing needs revoking - the token can be retrieved:
- Request it again with Option 1, which returns the existing token, or
- Call GET /oauth2/tokens, which lists every token issued to your ISV with its value and status

⚠️ **Never ask the merchant to revoke a token to get a new one.** Revocation is final: requesting
again afterwards returns the same REVOKED token, and the only way back is a fresh consent through an
AUTHORIZATION_ONLY invitation (\`payware_isv_create_invitation\`). To replace a token value, rotate it.

🔐 **Security:**
- Always store tokens securely
- Keep a backup copy in secure location
- Never share tokens or commit to code repositories`
        }]
      };
    }

    // Try to create a token
    const result = await obtainTokenTool.handler({ clientId, clientSecret, useSandbox });

    // Dead since the server stopped throwing ERR_TOKEN_EXISTS - the exception was deleted as
    // never-thrown - and kept only so the guidance below has a home if one-token-per-merchant is
    // ever enforced again. Matching on the substring of a rendered message was always fragile:
    // it also fires on any text that merely mentions the code.
    if (result.content?.[0]?.text?.includes('ERR_TOKEN_EXISTS')) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ **Token Already Exists for This Merchant**

🔍 **A token already exists for this merchant, and it can be retrieved.**

📋 **To find your token:**

**Option 1: List your tokens**
Call GET /oauth2/tokens - it lists every token issued to your ISV with its value and status.

**Option 2: If you have the token value**
Use: \`payware_authorization_oauth2_get_token_info\` with your token to check its status

**Option 3: Need a different value?**
Rotate it with POST /oauth2/tokens/{token}/rotate. Do not ask the merchant to revoke it - revocation
is final, and requesting again afterwards returns the same REVOKED token.

📋 **For immediate help:**
Run this tool with action='help' for more detailed guidance.`
        }]
      };
    }

    // If successful, extract and highlight the token
    const tokenMatch = result.content?.[0]?.text?.match(/NEW ACCESS TOKEN\*\*: ([A-Za-z0-9]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
      return {
        content: [{
          type: 'text',
          text: `${result.content[0].text}

🚨 **IMPORTANT: SAVE THIS TOKEN NOW!**

📋 **Your OAuth2 Token:**
\`\`\`
${token}
\`\`\`

🔄 **Next Steps:**
1. **SAVE THIS TOKEN** securely (if you lose it, GET /oauth2/tokens lists it again)
2. Check status: \`payware_authorization_oauth2_get_token_info\` with token: \`${token}\`
3. Wait for merchant approval (status will change to GRANTED)
4. Use token in API requests once GRANTED`
        }]
      };
    }

    // Return original result if we can't extract token but no error occurred
    return result;
  }
};

export default tokenHelperTool;