/**
 * ISV OAuth2 Token Management - Rotate Token (server Oauth2Controller.rotateToken).
 */

// Destructive (the old value stops working) and not idempotent (every call mints a new value), so a
// client must not retry it blindly after a timeout: the hints of COMMITS.
import { COMMITS } from '../../shared/tool-annotations.js';
import { oauth2Request, describeToken, oauth2Failure } from './tokens-api.js';

export const rotateTokenTool = {
  name: 'payware_authorization_oauth2_rotate_token',
  annotations: COMMITS,
  description: `Rotate an OAuth2 token: payware issues a new token value and resets its expiry, keeping the merchant authorization it was granted under. No merchant consent is needed, and it works on an expired token too.

The old value stops working at once, and each call returns a new value: after a timeout, list your tokens (payware_authorization_oauth2_list_tokens) rather than rotating again.

Endpoint: POST /oauth2/tokens/{token}/rotate at the host root, signed by the ISV for itself.`,

  inputSchema: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        description: 'The current token value'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ token, useSandbox = true }) {
    const result = await oauth2Request({ method: 'POST', path: `/oauth2/tokens/${encodeURIComponent(token)}/rotate`, useSandbox });
    if (!result.success) {
      return oauth2Failure('Rotating the OAuth2 token failed', result, [
        result.error.status === 404 ? 'Not a token of your ISV in this environment' : 'If the call timed out, list your tokens before rotating again'
      ]);
    }
    return {
      content: [{
        type: 'text',
        text: `🔄 **OAuth2 token rotated**

${describeToken(result.data)}

The old value no longer works: use the new one in every call for this merchant.`
      }]
    };
  }
};
