/**
 * ISV OAuth2 Token Management - Obtain Access Token
 *
 * Requests an access token for a merchant with the merchant's partner id and the Base64 pairing key
 * it gave the ISV (server Oauth2Controller.requestToken). For a merchant onboarded through an
 * invitation there is no pairing key: the token exists already, GRANTED, and
 * payware_authorization_oauth2_list_tokens returns it.
 */

import { CREATES } from '../../shared/tool-annotations.js';
import { oauth2Request, describeToken, oauth2Failure } from './tokens-api.js';

const MESSAGES = {
  ERR_UNSUPPORTED_GRANT_TYPE: 'Grant type must be "client_credentials"',
  ERR_MISSING_CLIENT_ID: 'Client ID (the merchant partnerId) is required',
  ERR_MISSING_CLIENT_SECRET: 'Client secret (the Base64 pairing key the merchant gave you) is missing or not Base64',
  ERR_CLIENT_NOT_FOUND: 'No merchant with that partner id and pairing key',
  ERR_CLIENT_DISABLED: 'The merchant account is disabled'
};

export const obtainTokenTool = {
  name: 'payware_authorization_oauth2_obtain_token',
  annotations: CREATES,
  description: `Request an OAuth2 access token for a merchant, with the merchant's partner id and the Base64 pairing key it gave you.

The token is PENDING until the merchant grants it in the payware portal; only GRANTED tokens work for calls on its behalf. Requesting again for the same merchant returns the existing token, not a second one (an expired GRANTED one comes back with a new value). A token expires 180 days after the merchant grants it or after the last rotation; rotate it with payware_authorization_oauth2_rotate_token, no merchant consent needed.

**Onboarded through an invitation?** Then you have no pairing key and need none: completing the invitation granted a token, which payware_authorization_oauth2_list_tokens returns.

Endpoint: POST /oauth2/tokens at the host root (https://sandbox.payware.eu/oauth2/tokens, production https://api.payware.eu/oauth2/tokens), signed by the ISV for itself (aud https://payware.eu).`,

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
        description: 'The Base64 pairing key the merchant gave you. Defaults to PAYWARE_OAUTH_CLIENT_SECRET env var.'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ grantType = 'client_credentials', clientId, clientSecret, useSandbox = true }) {
    const finalClientId = clientId || process.env.PAYWARE_OAUTH_CLIENT_ID;
    const finalClientSecret = clientSecret || process.env.PAYWARE_OAUTH_CLIENT_SECRET;
    if (!finalClientId) {
      throw new Error('Client ID is required. Provide via parameter or set PAYWARE_OAUTH_CLIENT_ID environment variable.');
    }
    if (!finalClientSecret) {
      throw new Error('Client Secret is required. Provide via parameter or set PAYWARE_OAUTH_CLIENT_SECRET environment variable.');
    }

    const result = await oauth2Request({
      method: 'POST',
      path: '/oauth2/tokens',
      body: { grantType, clientId: finalClientId, clientSecret: finalClientSecret },
      useSandbox
    });

    if (!result.success) {
      return oauth2Failure('OAuth2 token request failed', result, [
        MESSAGES[result.error.errorCode] ?? 'Check the merchant partner id and its Base64 pairing key',
        'A merchant onboarded through an invitation needs no request: list your tokens instead'
      ]);
    }

    const token = result.data;
    return {
      content: [{
        type: 'text',
        text: `✅ OAuth2 Token Request Successful

🎯 **NEW ACCESS TOKEN**: ${token.accessToken}

${describeToken(token)}

**Next steps:**
1. Wait for the merchant to grant it; check with payware_authorization_oauth2_get_token_info
2. Once GRANTED, call for the merchant with merchantPartnerId \`${token.clientId ?? finalClientId}\` and this token (JWT aud = the merchant, sub = the token)

Store the token securely: with your key it is a credential to act for this merchant.`
      }]
    };
  }
};
