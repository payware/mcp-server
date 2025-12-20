/**
 * ISV OAuth2 Token Management - Obtain Access Token
 *
 * Allows ISVs to request an access token on behalf of a payware registered merchant.
 * This is the first step in the ISV authorization flow.
 */

export const obtainTokenTool = {
  name: 'payware_authorization_oauth2_obtain_token',
  description: `Obtain an OAuth2 access token for a merchant.

ISVs must be authorized by payware registered merchants to make requests on their behalf.
This endpoint allows ISVs to request a token using the merchant's credentials.

IMPORTANT: Access tokens do not expire and only one token is allowed per merchant.
Store tokens securely using strong encryption.

Endpoint: POST /oauth2/tokens
Auth: Requires ISV JWT token with aud: "https://payware.eu"`,

  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      grantType: {
        type: 'string',
        enum: ['client_credentials'],
        default: 'client_credentials',
        description: 'OAuth2 grant type. Only "client_credentials" is supported.'
      },
      clientId: {
        type: 'string',
        description: 'The partnerId of the merchant (e.g., "ZJJTFQDQ"). Defaults to PAYWARE_OAUTH_CLIENT_ID env var.'
      },
      clientSecret: {
        type: 'string',
        description: 'Base64 encoded value of the payware secret of the merchant. Defaults to PAYWARE_OAUTH_CLIENT_SECRET env var.'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ grantType = 'client_credentials', clientId, clientSecret, useSandbox = true }) {
    const axios = (await import('axios')).default;
    const { createISVJWT } = await import('../utils/auth.js');
    const { getSandboxUrl, getProductionUrl } = await import('../../config/env.js');

    // Use environment variables as defaults
    const finalClientId = clientId || process.env.PAYWARE_OAUTH_CLIENT_ID;
    const finalClientSecret = clientSecret || process.env.PAYWARE_OAUTH_CLIENT_SECRET;

    if (!finalClientId) {
      throw new Error('Client ID is required. Provide via parameter or set PAYWARE_OAUTH_CLIENT_ID environment variable.');
    }

    if (!finalClientSecret) {
      throw new Error('Client Secret is required. Provide via parameter or set PAYWARE_OAUTH_CLIENT_SECRET environment variable.');
    }

    try {
      const requestBody = {
        grantType,
        clientId: finalClientId,
        clientSecret: finalClientSecret
      };

      // Create JWT for OAuth2 request (audience must be https://payware.eu)
      const jwt = await createISVJWT({
        requestBody,
        audience: 'https://payware.eu',
        isOAuth2Request: true
      });

      const { createISVAuthHeaders } = await import('../utils/auth.js');

      const apiUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
      const baseUrl = apiUrl.replace('/api', ''); // OAuth2 endpoints don't use /api
      const headers = createISVAuthHeaders(jwt, true); // true = isOAuth2Request (no Api-Version header)

      const response = await axios.post(`${baseUrl}/oauth2/tokens`, requestBody, {
        headers
      });

      const result = response.data;

      return {
        content: [{
          type: "text",
          text: `✅ OAuth2 Token Request Successful

🎯 **NEW ACCESS TOKEN**: ${result.accessToken}

📄 **Response Details:**
- **Access Token**: ${result.accessToken}
- **Token Type**: ${result.tokenType}
- **Status**: ${result.status}
- **Scope**: ${result.scope}
- **Expires**: ${result.expiresIn || 'Never (client_credentials tokens do not expire)'}

📋 **Copy this token for next operations:**
\`${result.accessToken}\`

🔐 **Security Reminder:**
- Store this token securely with strong encryption
- Only one token is allowed per merchant
- Use this token in the "sub" claim of future JWT requests

📋 **Next Steps:**
1. Check token status: Use token \`${result.accessToken}\` with payware_oauth2_get_token_info
2. Wait for merchant approval (status will change from PENDING to GRANTED)
3. Use this token in JWT "sub" claim for API requests to merchant data
4. Set JWT "aud" claim to the merchant's partnerId (${finalClientId}) for API calls`
        }]
      };

    } catch (error) {
      let errorMessage = 'OAuth2 token request failed';
      let errorDetails = {};

      if (error.response) {
        errorDetails.httpStatus = error.response.status;
        errorDetails.responseData = error.response.data;

        if (error.response.data?.error) {
          const errorCode = error.response.data.error;
          const errorMappings = {
            'ERR_UNSUPPORTED_GRANT_TYPE': 'Grant type must be "client_credentials"',
            'ERR_MISSING_CLIENT_ID': 'Client ID (merchant partnerId) is required',
            'ERR_MISSING_CLIENT_SECRET': 'Client secret (base64 encoded merchant secret) is required',
            'ERR_CLIENT_NOT_FOUND': 'Merchant not found with provided client ID',
            'ERR_CLIENT_DISABLED': 'Merchant account is disabled',
            'ERR_TOKEN_EXISTS': 'Token already exists for this merchant. Only one token per merchant is allowed.'
          };

          errorMessage = errorMappings[errorCode] || `Error: ${errorCode}`;

          // Special handling for ERR_TOKEN_EXISTS - try to get existing token info
          if (errorCode === 'ERR_TOKEN_EXISTS') {
            errorMessage += '\\n\\n🔍 **To find your existing token:**\\n1. Check your secure storage where you saved the previous token\\n2. Or use payware_oauth2_get_token_info if you know the token\\n3. Contact merchant to revoke existing token if you need a new one';
          }
        } else {
          errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error - no response received';
        errorDetails.requestInfo = {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        };
      } else {
        errorMessage = error.message;
      }

      return {
        content: [{
          type: "text",
          text: `❌ OAuth2 Token Request Failed

**Error**: ${errorMessage}

**Request Details:**
- ISV Partner ID: ${process.env.PAYWARE_PARTNER_ID}
- Merchant Partner ID: ${finalClientId}
- Grant Type: ${grantType}
- Target URL: ${getSandboxUrl().replace('/api', '')}/oauth2/tokens

${Object.keys(errorDetails).length > 0 ? `
**Error Details:**
\`\`\`json
${JSON.stringify(errorDetails, null, 2)}
\`\`\`
` : ''}

📋 **Troubleshooting:**
- Verify merchant partnerId (clientId) is correct
- Ensure merchant secret is properly base64 encoded
- Check if merchant account is active
- Confirm no existing token for this merchant
- Verify ISV JWT token is properly signed for OAuth2 requests`
        }]
      };
    }
  }
};