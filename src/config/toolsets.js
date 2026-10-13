/**
 * Toolsets: named groups of tools, so a client can load only what it needs.
 *
 * Every tool definition is sent in tools/list and from there into every prompt the client builds, so
 * a merchant with 72 tools pays for all of them on every turn whether it uses them or not. Setting
 * PAYWARE_MCP_TOOLSETS=products,placements loads those two groups and nothing else. Unset, every tool
 * loads, as it always has.
 *
 * This narrows what the assistant is offered; it is not access control. What a call may do is still
 * decided by payware for the configured partner.
 *
 * Toolsets are assigned by tool name, not by prefix alone: the placement and airing tools sit under
 * payware_products_* because the API nests them under products, yet they are a separate concern.
 * tests/tool-contract.test.js fails on a tool that belongs to no toolset, so a new tool family has to
 * be placed here.
 */

/** Toolset name -> what it holds. The order is the order they are listed in messages. */
export const TOOLSETS = {
  auth: 'Keys, JWTs and, for ISVs, OAuth2 tokens',
  transactions: 'Create, process, finalize, cancel and look up transactions, and simulate callbacks',
  products: 'Products, price schedules, audio and product images',
  placements: 'Campaigns, placements, airing rules and the airing calendar',
  deep_links: 'Shareable links for transactions and products',
  data: 'Reports and exports',
  logs: 'API logs (Premium)',
  poi: 'Points of interaction (ISV)',
  shops: 'Shop codes',
  onboarding: 'ISV merchant invitations and the reference data their forms need',
  utils: 'Code samples, documentation, request formatting and server information'
};

const BY_PREFIX = [
  ['payware_authentication_', 'auth'],
  ['payware_authorization_', 'auth'],
  ['payware_operations_', 'transactions'],
  ['payware_products_', 'products'],
  ['payware_deep_links_', 'deep_links'],
  ['payware_data_', 'data'],
  ['payware_logs_', 'logs'],
  ['payware_poi_', 'poi'],
  ['payware_shops_', 'shops'],
  ['payware_isv_', 'onboarding'],
  ['payware_reference_', 'onboarding'],
  ['payware_utils_', 'utils'],
  ['payware_generate_', 'utils']
];

/**
 * The toolset a tool belongs to, or null for a name no rule covers.
 * @param {string} name tool name
 * @returns {string|null}
 */
export function toolsetOf(name) {
  if (name.startsWith('payware_campaigns_') || /^payware_products_.*(placement|airing)/.test(name)) {
    return 'placements';
  }
  const match = BY_PREFIX.find(([prefix]) => name.startsWith(prefix));
  return match ? match[1] : null;
}

/**
 * Narrow a role's tools to the toolsets named in `setting` (PAYWARE_MCP_TOOLSETS).
 *
 * Unset, blank or containing `all`: every tool. Names are case-insensitive and may use a hyphen for
 * the underscore. An unknown name is ignored with a warning, and when no known name is left every
 * tool loads, because a typo that silently served no tools would look like a broken server. A known
 * toolset with no tools for this role is a warning too, not an error.
 *
 * @param {Array} tools the role's tools
 * @param {string|undefined} setting the PAYWARE_MCP_TOOLSETS value
 * @returns {{tools: Array, selected: string[]|null, warnings: string[]}} selected is null when all load
 */
export function filterToolsets(tools, setting) {
  const names = String(setting ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase().replace(/-/g, '_'))
    .filter(Boolean);

  if (names.length === 0 || names.includes('all')) {
    return { tools, selected: null, warnings: [] };
  }

  const known = Object.keys(TOOLSETS);
  const warnings = [];
  const unknown = names.filter(n => !known.includes(n));
  if (unknown.length > 0) {
    warnings.push(`PAYWARE_MCP_TOOLSETS: unknown toolset ${unknown.join(', ')} ignored. Known: ${known.join(', ')}, or all.`);
  }

  const selected = known.filter(n => names.includes(n));
  if (selected.length === 0) {
    warnings.push('PAYWARE_MCP_TOOLSETS names no known toolset, so every tool is loaded.');
    return { tools, selected: null, warnings };
  }

  const kept = tools.filter(t => selected.includes(toolsetOf(t.name)));
  for (const set of selected) {
    if (!kept.some(t => toolsetOf(t.name) === set)) {
      warnings.push(`PAYWARE_MCP_TOOLSETS: toolset ${set} has no tools for this partner type.`);
    }
  }
  return { tools: kept, selected, warnings };
}
