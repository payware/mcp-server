/**
 * ISV OAuth2 Token Management - Get Token Information (server Oauth2Controller.getToken).
 */

import { READS } from '../../shared/tool-annotations.js';
import { oauth2Request, describeToken, oauth2Failure } from './tokens-api.js';

export const getTokenInfoTool = {
  name: 'payware_authorization_oauth2_get_token_info',
  annotations: READS,
  description: `Get the status of one of your OAuth2 tokens: PENDING, GRANTED or REVOKED, and when it expires.

Only tokens issued to your ISV are found; any other answers 404 ERR_TOKEN_NOT_FOUND.

Endpoint: GET /oauth2/tokens/{token} at the host root, signed by the ISV for itself.`,

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
    const result = await oauth2Request({ method: 'GET', path: `/oauth2/tokens/${encodeURIComponent(token)}`, useSandbox });
    if (!result.success) {
      return oauth2Failure('Token information request failed', result, [
        result.error.status === 404 ? 'Not a token of your ISV in this environment' : 'Check the token value and the environment'
      ]);
    }
    const info = result.data;
    return {
      content: [{
        type: 'text',
        text: `📋 **OAuth2 Token Information**

${describeToken(info)}

${info.status === 'GRANTED' && info.expiresIn === 0 ? 'Expired: rotate it with payware_authorization_oauth2_rotate_token (no merchant consent needed).'
  : info.status === 'GRANTED' ? 'Ready for calls on behalf of the merchant: JWT aud = the merchant partner id, sub = this token.'
    : info.status === 'PENDING' ? 'Waiting for the merchant to grant it in the payware portal.'
      : 'Revoked, and revocation is final: requesting again returns this same token; the merchant must consent again through an AUTHORIZATION_ONLY invitation (payware_isv_create_invitation).'}`
      }]
    };
  }
};
