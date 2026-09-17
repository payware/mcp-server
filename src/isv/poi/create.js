import { buildCreatePOITool, buildCreatePOIBatchTool } from '../../shared/poi/poi-create-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * POI creation for the ISV role.
 *
 * Signed as an on-behalf call. The shop named must be inside the scope the merchant assigned this
 * ISV - anything else is 403 ERR_SHOP_NOT_IN_SCOPE, and for the batch that refuses the whole batch,
 * not the offending entry.
 */
const resolveAuth = (args) => ({
  isvPartnerId: getPartnerIdSafe(),
  privateKey: getPrivateKeySafe(args.useSandbox ?? true),
  merchantPartnerId: args.merchantPartnerId,
  oauth2Token: args.oauth2Token
});

export const createPOITool = buildCreatePOITool({ partnerType: 'isv', resolveAuth });
export const createPOIBatchTool = buildCreatePOIBatchTool({ partnerType: 'isv', resolveAuth });
