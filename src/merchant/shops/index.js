import { buildListShopsTool } from '../../shared/shops/shops-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Shop tools for the merchant role.
 *
 * The tool body is shared with the ISV role - the only thing that differs is how the request is
 * signed and, on the server side, which shops come back. See shared/shops/shops-api.js.
 */
export const listShopsTool = buildListShopsTool({
  partnerType: 'merchant',
  resolveAuth: (args) => ({
    partnerId: args.partnerId || getPartnerIdSafe(),
    privateKey: args.privateKey || getPrivateKeySafe(args.useSandbox ?? true)
  })
});

export const merchantShopTools = [listShopsTool];
