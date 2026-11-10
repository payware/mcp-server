/**
 * POI (point of interaction) tools for merchants.
 *
 * The server serves every POI route to a merchant itself (ApiPOIController: @ApiAudience(MERCHANT),
 * BSC/STD/PRM, requireMerchantId), and kb merchant/api-poi addresses merchants, but only ISVs had the
 * tools. These are the ISV tools without the two on-behalf parameters: the request functions sign with
 * the configured partner's own JWT when the partner type is merchant (core/auth/jwt-factory.js), so the
 * same code serves both roles. Creation comes from the shared builders, as for the ISV.
 */

import { buildCreatePOITool, buildCreatePOIBatchTool } from '../../shared/poi/poi-create-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import {
  listPOIsTool,
  getPOITool,
  getPOIStatusTool,
  setPOIPriceTool,
  cancelPOIPriceTool,
  getPOIQRCodeTool
} from '../../isv/poi/index.js';

const ON_BEHALF = ['merchantPartnerId', 'oauth2Token'];

/** Who signs, said for a merchant rather than for an ISV. */
function merchantDescription(text) {
  return text
    .replace(/\*\*ISV Authentication:\*\*[^\n]*/g, '**Authentication:** your own JWT (an ISV makes the same call on your behalf).')
    .replace(/\*\*Authentication:\*\* On behalf of the merchant that owns the POI/g, '**Authentication:** your own JWT')
    .replace(/,? and the merchant partner ID and OAuth2 token to act on its behalf\./g, '.')
    .replace(/,? ?Merchant Partner ID,? and OAuth2 token( for ISV authentication)?\.?/g, '.')
    .replace(/\*\*Required:\*\*\s*\.\s*/g, '')
    .replace(/ via ISV authentication/g, '')
    .replace(/ for ISV\b/g, '');
}

function forMerchant(tool) {
  const properties = Object.fromEntries(Object.entries(tool.inputSchema.properties).filter(([name]) => !ON_BEHALF.includes(name)));
  return {
    ...tool,
    description: merchantDescription(tool.description),
    inputSchema: {
      ...tool.inputSchema,
      properties,
      required: (tool.inputSchema.required ?? []).filter(name => !ON_BEHALF.includes(name))
    }
  };
}

const resolveAuth = (args) => ({
  partnerId: getPartnerIdSafe(),
  privateKey: getPrivateKeySafe(args.useSandbox ?? true)
});

export const merchantPOITools = [
  buildCreatePOITool({ partnerType: 'merchant', resolveAuth }),
  buildCreatePOIBatchTool({ partnerType: 'merchant', resolveAuth }),
  ...[listPOIsTool, getPOITool, getPOIStatusTool, setPOIPriceTool, cancelPOIPriceTool, getPOIQRCodeTool].map(forMerchant)
];
