/**
 * Every tool as the client gets it: a failure is a result with `isError: true`, never a success.
 *
 * Two ways a failure used to read as a success. Tools answered a refused call with text that began
 * with ❌ and no isError, so a client or a model branching on isError took every refusal for a result;
 * and a tool that threw became a JSON-RPC error, which most clients show as a broken tool rather than
 * as an answer the model can act on (the MCP specification asks for an isError result). The role
 * registries wrap every tool with this, so one rule covers all of them; tests/tool-routes.test.js
 * runs every tool against a payware 400 and fails on any that does not end as isError.
 */

const FAILURE_PREFIX = /^\s*❌/;

function marked(result) {
  if (!result || result.isError !== undefined || !Array.isArray(result.content)) return result;
  const first = result.content.find(item => item.type === 'text');
  return first && FAILURE_PREFIX.test(first.text) ? { ...result, isError: true } : result;
}

/** The tool with its handler wrapped: a throw becomes an isError result, and a ❌ answer is marked. */
export function withErrorResult(tool) {
  return {
    ...tool,
    async handler(args) {
      try {
        return marked(await tool.handler(args));
      } catch (error) {
        return { content: [{ type: 'text', text: `❌ ${error.message}` }], isError: true };
      }
    }
  };
}
