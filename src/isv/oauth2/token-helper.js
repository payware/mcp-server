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
- Only ONE token allowed per merchant
- Tokens don't expire (client_credentials flow)
- Token status: PENDING → GRANTED (after merchant approval)

🎯 **To get your token:**

**Option 1: Try creating a token**
Use: \`payware_oauth2_obtain_token\`
- If successful: New token will be clearly displayed
- On failure the server names the reason (e.g. client not found, client disabled)

**Option 2: Check a known token**
Use: \`payware_oauth2_get_token_info\` with your saved token
- Shows current status (PENDING/GRANTED/REVOKED)

**Option 3: Create new token (if current is lost)**
1. Contact merchant to revoke existing token
2. Then use \`payware_oauth2_obtain_token\` to create new one

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

🔍 **Your existing token is stored somewhere secure** (as per OAuth2 best practices, the server doesn't return existing tokens).

📋 **To find your token:**

**Option 1: Check your secure storage**
- Look where you saved tokens before
- Environment variables file
- Secure configuration management
- Password manager

**Option 2: If you have the token value**
Use: \`payware_oauth2_get_token_info\` with your token to check its status

**Option 3: Create new token**
1. Contact the merchant (Partner ID: ${process.env.PAYWARE_OAUTH_CLIENT_ID || 'not configured'})
2. Ask them to revoke the existing token
3. Then use \`payware_oauth2_obtain_token\` to create a new one

💡 **Tip:** Always keep a secure backup of your OAuth2 tokens!

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
1. **SAVE THIS TOKEN** securely (you won't be able to retrieve it later)
2. Check status: \`payware_oauth2_get_token_info\` with token: \`${token}\`
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