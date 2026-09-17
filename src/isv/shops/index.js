import { buildListShopsTool } from '../../shared/shops/shops-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Shop tools for the ISV role.
 *
 * Signed as an on-behalf call, so the server answers with the shops this merchant assigned to this
 * ISV's scope - not every shop the merchant owns. Anything outside that scope is a 403
 * ERR_SHOP_NOT_IN_SCOPE on the write paths, which is why listing matters more here than it does for
 * a merchant acting on its own estate.
 */
export const listShopsTool = buildListShopsTool({
  partnerType: 'isv',
  resolveAuth: (args) => ({
    isvPartnerId: getPartnerIdSafe(),
    privateKey: getPrivateKeySafe(args.useSandbox ?? true),
    merchantPartnerId: args.merchantPartnerId,
    oauth2Token: args.oauth2Token
  })
});

export const isvShopTools = [listShopsTool];
