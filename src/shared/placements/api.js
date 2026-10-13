import axios from 'axios';
import { createMinimizedJSON } from '../../core/utils/json-serializer.js';
import { getSandboxUrl, getProductionUrl } from '../../config/env.js';
import { createAuthHeaders } from '../auth-headers.js';
import { apiErrorResult } from '../api-errors.js';

/**
 * One call to the campaigns, placements and airings API, as a merchant or as an ISV acting for one.
 *
 * Built on the shared `createAuthHeaders`, so the on-behalf JWT (`aud` = the merchant, `sub` = its
 * OAuth2 token) and the content hash come from the same code every newer tool uses. The body is
 * serialized once and that exact string is both hashed and sent; `transformRequest` stops axios from
 * serializing it a second time.
 *
 * Never throws for an HTTP error: it returns `apiErrorResult`, whose `details` keeps the response
 * body, which is where a refused replace-all lists its rows.
 *
 * @param {Object} params
 * @param {string} params.method    HTTP verb
 * @param {string} params.path      path under the API root, ids already encoded
 * @param {Object} [params.query]   query parameters; undefined values are left out
 * @param {*} [params.body]         request body, serialized deterministically
 * @param {boolean} [params.binary] read the response as bytes (images)
 * @param {Object} params.auth      from the role: partnerType, credentials and useSandbox
 */
export async function placementsRequest({ method, path, query, body, binary = false, auth }) {
  const minimizedBody = body === undefined ? undefined : createMinimizedJSON(body);
  const headers = await createAuthHeaders(auth.partnerType, { ...auth, requestBody: minimizedBody });
  const baseUrl = auth.useSandbox ? getSandboxUrl() : getProductionUrl();
  const params = query && Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null));

  try {
    const response = await axios({
      method,
      url: `${baseUrl}${path}`,
      headers,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(minimizedBody !== undefined && { data: minimizedBody, transformRequest: [(data) => data] }),
      ...(binary && { responseType: 'arraybuffer' })
    });
    return {
      success: true,
      status: response.status,
      data: response.data,
      contentType: response.headers['content-type'],
      requestId: response.headers['x-request-id']
    };
  } catch (error) {
    return apiErrorResult(error);
  }
}
