import { createJWTToken } from '../core/auth/jwt-token.js';
import { createJWTForPartner } from '../core/auth/jwt-factory.js';

/**
 * Build the Authorization headers for a payware API call, for any partner role.
 *
 * Merchants and financial institutions sign with their own key. An ISV signs with its own key too,
 * but adds the merchant it is acting for in the `aud` claim and that merchant's OAuth2 token in
 * `sub` - which is what makes the call an on-behalf call rather than an ISV-for-itself call.
 *
 * **Note on duplication.** Four near-identical private copies of this function already exist, in
 * `shared/products/products-api.js`, `shared/data/data-api.js`, `shared/deep-links/api.js` and
 * `shared/logs/logs-api.js`. This is the shared one, used by everything added since. The four were
 * deliberately left alone rather than swept into it: they are on live, working paths, they differ in
 * small ways that look accidental but have not been proven so (deep-links defaults `requestBody` to
 * `''` where the others pass `undefined`, and for a GET those are not always the same thing to a
 * hash calculation), and consolidating them is a refactor of authentication with no test suite
 * behind it. Do it as its own change, with the `''`-vs-`undefined` question answered first, not as a
 * side effect of adding a tool.
 *
 * @param {string} partnerType   'merchant' | 'payment_institution' | 'isv'
 * @param {Object} authParams    partnerId + privateKey, or isvPartnerId + privateKey +
 *                               merchantPartnerId + oauth2Token; plus requestBody for writes
 * @returns {Promise<Object>} headers including Authorization, Content-Type and Api-Version
 */
export async function createAuthHeaders(partnerType, authParams) {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  let tokenData;

  switch (partnerType) {
    case 'merchant':
    case 'payment_institution':
      tokenData = createJWTToken(
        authParams.partnerId,
        authParams.privateKey,
        authParams.requestBody
      );
      break;

    case 'isv':
      tokenData = await createJWTForPartner({
        partnerId: authParams.isvPartnerId,
        privateKey: authParams.privateKey,
        merchantId: authParams.merchantPartnerId,
        oauth2Token: authParams.oauth2Token,
        requestBody: authParams.requestBody
      });
      break;

    default:
      throw new Error(`Unknown partner type: ${partnerType}`);
  }

  return {
    ...baseHeaders,
    'Authorization': `Bearer ${tokenData.token}`
  };
}
