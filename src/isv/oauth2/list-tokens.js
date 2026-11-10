/**
 * ISV OAuth2 Token Management - List Tokens (server Oauth2Controller.getTokens).
 *
 * The only way to the token of a merchant onboarded through an invitation: completing the invitation
 * creates a GRANTED authorization, and nothing else returns its token.
 */

import { READS } from '../../shared/tool-annotations.js';
import { oauth2Request, describeToken, oauth2Failure } from './tokens-api.js';

export const listTokensTool = {
  name: 'payware_authorization_oauth2_list_tokens',
  annotations: READS,
  description: `List your ISV's OAuth2 tokens: one per merchant authorization, in any status, each with its merchant (clientId), value, status and expiry.

This is how you get the token of a merchant onboarded through an invitation: completing the invitation granted it, and no pairing key is involved. A merchant that has been deleted is not listed (its authorization is revoked with it, and the merchant.deleted callback says so).

Endpoint: GET /oauth2/tokens at the host root, signed by the ISV for itself.`,

  inputSchema: {
    type: 'object',
    properties: {
      merchantPartnerId: {
        type: 'string',
        description: 'Optional: show only the token of this merchant (filtered here; the server returns all)'
      },
      useSandbox: {
        type: 'boolean',
        description: 'Use sandbox environment for testing',
        default: true
      }
    }
  },

  async handler({ merchantPartnerId, useSandbox = true }) {
    const result = await oauth2Request({ method: 'GET', path: '/oauth2/tokens', useSandbox });
    if (!result.success) {
      return oauth2Failure('Listing the OAuth2 tokens failed', result);
    }
    const all = Array.isArray(result.data) ? result.data : [];
    const tokens = merchantPartnerId ? all.filter(t => t.clientId === merchantPartnerId) : all;
    return {
      content: [{
        type: 'text',
        text: `🔑 **OAuth2 tokens** (${tokens.length}${merchantPartnerId ? ` for ${merchantPartnerId}` : ''} of ${all.length})

${tokens.length ? tokens.map(describeToken).join('\n\n') : 'None.'}

Use a GRANTED token with its merchant's partner id for calls on its behalf (JWT aud = the merchant, sub = the token).`
      }]
    };
  }
};
