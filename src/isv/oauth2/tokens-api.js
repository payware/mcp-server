import axios from 'axios';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getOAuthBaseUrl, getPartnerIdSafe, getPrivateKeySafe, privateKeyVariable } from '../../config/env.js';
import { apiErrorResult } from '../../shared/api-errors.js';

/**
 * One call to the ISV's own OAuth2 endpoints (server Oauth2Controller), shared by the token tools.
 *
 * - Served at the host root, not under /api: https://sandbox.payware.eu/oauth2/..., production
 *   https://api.payware.eu/oauth2/... (getOAuthBaseUrl).
 * - Signed by the ISV for itself: aud https://payware.eu and no sub (the filter refuses any other aud on
 *   /oauth2), with the key of the environment called. They took the sandbox key for production calls.
 * - No Api-Version header: the filter does not ask for one on /oauth2.
 * - A body is serialized once; that string is hashed into contentSha256 and sent.
 *
 * Never throws for an HTTP error; returns apiErrorResult, which carries no request headers, so a
 * failure can no longer print the Authorization header.
 */
export async function oauth2Request({ method, path, body, useSandbox = true }) {
  const partnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe(useSandbox);
  if (!partnerId) {
    throw new Error('PAYWARE_PARTNER_ID (your ISV partner id) is required');
  }
  if (!privateKey) {
    throw new Error(`${privateKeyVariable(useSandbox)} is required`);
  }

  const bodyString = body === undefined ? undefined : createMinimizedJSON(body);
  const { token } = createJWTToken(partnerId, privateKey, bodyString ?? null);
  const url = `${getOAuthBaseUrl(useSandbox)}${path}`;

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(bodyString !== undefined && { 'Content-Type': 'application/json' })
      },
      ...(bodyString !== undefined && { data: bodyString, transformRequest: [(data) => data] })
    });
    return { success: true, data: response.data, url, requestId: response.headers['x-correlation-id'] };
  } catch (error) {
    return { ...apiErrorResult(error), url };
  }
}

const STATUS = {
  PENDING: '⏳ PENDING - the merchant has not granted it yet',
  GRANTED: '✅ GRANTED - valid for calls on behalf of the merchant',
  REVOKED: '❌ REVOKED - final; the merchant must consent again through an AUTHORIZATION_ONLY invitation'
};

/** One token as the server's Oauth2Token describes it. */
export function describeToken(token) {
  const expires = token.expiresIn == null ? 'no expiration date'
    : token.expiresIn === 0 ? 'expired - rotate it (no merchant consent needed)'
      : `${token.expiresIn} seconds (~${Math.floor(token.expiresIn / 86400)} days)`;
  return `- Merchant (clientId): ${token.clientId ?? 'N/A'}
- Access token: \`${token.accessToken}\`
- Status: ${STATUS[token.status] ?? token.status}
- Expires: ${expires}`;
}

/** The failure text, without credentials. */
export function oauth2Failure(title, result, hints = []) {
  return {
    content: [{
      type: 'text',
      text: `❌ ${title}

- Status: ${result.error.status ?? 'no response'}
- Code: ${result.error.errorCode ?? 'N/A'}
- Message: ${result.error.message}
- URL: ${result.url}
${result.error.correlationId ? `- Correlation ID: ${result.error.correlationId}\n` : ''}${hints.length ? `\n${hints.map(h => `- ${h}`).join('\n')}` : ''}`
    }],
    isError: true
  };
}
