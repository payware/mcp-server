/**
 * Payer partner tools registry: a buying agent acting for a person.
 *
 * No keys and no shared tools: no JWT, RSA key or code-sample tools are offered, because a payer has
 * no credentials to use them with. Four tools talk to the public link host (see links-api.js).
 */
import { payerTools } from './tools.js';
import { withErrorResult } from '../shared/tool-result.js';

export { payerTools };

/**
 * Get tools for the payer partner type
 * @returns {Array} the payer tools, each wrapped so a failure reaches the client as isError
 */
export function getPayerTools() {
  return payerTools.map(tool => {
    let newName = tool.name;

    // Payer tools keep their payer grouping
    if (tool.name.startsWith('payware_payer_')) {
      newName = tool.name; // Keep payer grouping
    }

    return withErrorResult({
      ...tool,
      name: newName
    });
  });
}
