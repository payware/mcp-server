/**
 * ISV OAuth2 Token Management - Get Token Information
 *
 * Retrieves information about an existing OAuth2 access token.
 * Use this to check token status and present information in POS software UI.
 */

export const getTokenInfoTool = {
  name: 'payware_authorization_oauth2_get_token_info',
  description: `Get information about an OAuth2 access token.

This endpoint exposes information about access tokens, including their status.
Only information about tokens requested by the ISV is returned.

Use this to check token status and present information to users in POS software.

Endpoint: GET /oauth2/tokens/{token}
Auth: Requires ISV JWT token`,

  inputSchema: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        description: 'The OAuth2 access token to get information about'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ token, useSandbox = true }) {
    const axios = (await import('axios')).default;
    const { createISVJWT } = await import('../utils/auth.js');
    const { getSandboxUrl, getProductionUrl } = await import('../../config/env.js');

    try {
      // Create JWT for token info request
      const jwt = await createISVJWT({
        isGetRequest: true,
        isOAuth2Request: true,
        audience: 'https://payware.eu'
      });

      const { createISVAuthHeaders } = await import('../utils/auth.js');

      const apiUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
      const baseUrl = apiUrl.replace('/api', ''); // OAuth2 endpoints don't use /api
      const headers = createISVAuthHeaders(jwt, true); // true = isOAuth2Request (no Api-Version header)

      const response = await axios.get(`${baseUrl}/oauth2/tokens/${token}`, {
        headers
      });

      const result = response.data;

      const statusEmoji = {
        'PENDING': '⏳',
        'GRANTED': '✅',
        'REVOKED': '❌'
      };

      const statusDescription = {
        'PENDING': 'Token is pending approval',
        'GRANTED': 'Token is active and valid for API requests',
        'REVOKED': 'Token has been revoked and is no longer valid'
      };

      return {
        content: [{
          type: "text",
          text: `📋 **OAuth2 Token Information**

🔑 **Token Details:**
- **Access Token**: ${result.access_token}
- **Token Type**: ${result.token_type}
- **Status**: ${statusEmoji[result.status]} ${result.status}
- **Description**: ${statusDescription[result.status]}
- **Scope**: ${result.scope}
- **Expires**: ${result.expires_in || 'Never (client_credentials tokens do not expire)'}

${result.status === 'GRANTED' ?
  '✅ **Token is ready for use in API requests**' :
  result.status === 'PENDING' ?
    '⏳ **Token is pending - wait for merchant approval**' :
    '❌ **Token is revoked - obtain a new token**'
}

📋 **Usage Notes:**
- Only GRANTED tokens can be used for API requests
- Include this token in the "sub" claim of JWT for API calls
- Set "aud" claim to merchant partnerId when making API requests`
        }]
      };

    } catch (error) {
      let errorMessage = 'Failed to retrieve token information';
      let errorDetails = {};

      if (error.response) {
        errorDetails.httpStatus = error.response.status;
        errorDetails.responseData = error.response.data;

        if (error.response.data?.errorCode) {
          const errorCode = error.response.data.errorCode;
          if (errorCode === 'ERR_TOKEN_NOT_FOUND') {
            errorMessage = 'Token not found or you do not have permission to view this token';
          } else {
            errorMessage = `Error: ${errorCode} - ${error.response.data.message || ''}`;
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
          text: `❌ Token Information Request Failed

**Error**: ${errorMessage}

**Request Details:**
- ISV Partner ID: ${process.env.PAYWARE_PARTNER_ID}
- Token: ${token}
- Target URL: ${getSandboxUrl().replace('/api', '')}/oauth2/tokens/${token}

${Object.keys(errorDetails).length > 0 ? `
**Error Details:**
\`\`\`json
${JSON.stringify(errorDetails, null, 2)}
\`\`\`
` : ''}

📋 **Troubleshooting:**
- Verify the token value is correct
- Ensure you have permission to view this token
- Check if the token was created by your ISV account
- Verify your ISV JWT token is properly signed`
        }]
      };
    }
  }
};