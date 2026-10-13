import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER_PATH = fileURLToPath(new URL('../../src/index.js', import.meta.url));

/**
 * Talk to the real stdio server the way an MCP client does: spawn `src/index.js`, write
 * newline-delimited JSON-RPC to its stdin, read newline-delimited JSON-RPC from its stdout.
 *
 * Deliberately not the SDK's Client. What a client receives is the wire, and a test that goes through
 * the same SDK as the server can agree with it about something no other client would accept.
 *
 * The child gets a hermetic environment: every PAYWARE_* variable from the parent is dropped and only
 * `env` is applied, and it runs in `cwd`, which should be a temp directory. Both matter on a developer
 * machine, where the parent may carry real partner settings and the repo root holds a `.env` that
 * dotenv would otherwise load.
 *
 * The timeout is generous because starting the server means loading the SDK and every tool module,
 * which takes seconds on a slow or network-mounted disk; a hung server still fails, just later.
 *
 * Resolves with the responses keyed by request id once every request in `messages` has one.
 */
export async function stdioExchange({ env = {}, cwd, messages, timeoutMs = 60000 }) {
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('PAYWARE_'))
  );
  Object.assign(childEnv, env);

  const child = spawn(process.execPath, [SERVER_PATH], { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Set(messages.filter(m => m.id !== undefined).map(m => m.id));
  const responses = new Map();
  let stdout = '';
  let stderr = '';

  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no response for ids ${[...pending].join(', ')} within ${timeoutMs}ms\nstderr:\n${stderr}`));
      }, timeoutMs);

      child.stderr.on('data', chunk => { stderr += chunk; });
      child.stdout.on('data', chunk => {
        stdout += chunk;
        let newline;
        while ((newline = stdout.indexOf('\n')) !== -1) {
          const line = stdout.slice(0, newline).trim();
          stdout = stdout.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line);
          if (message.id !== undefined && pending.delete(message.id)) {
            responses.set(message.id, message);
          }
          if (pending.size === 0) {
            clearTimeout(timer);
            resolve(responses);
          }
        }
      });
      child.on('exit', code => {
        if (pending.size > 0) {
          clearTimeout(timer);
          reject(new Error(`server exited with ${code} before answering\nstderr:\n${stderr}`));
        }
      });

      for (const message of messages) {
        child.stdin.write(JSON.stringify(message) + '\n');
      }
    });
  } finally {
    child.kill();
  }
}

/** The handshake every session starts with, at `protocolVersion`, followed by `requests`. */
export function sessionAt(protocolVersion, ...requests) {
  return [
    {
      jsonrpc: '2.0', id: 'init', method: 'initialize',
      params: { protocolVersion, capabilities: {}, clientInfo: { name: 'payware-mcp-tests', version: '0' } }
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...requests
  ];
}

/** A session at the oldest protocol version still in use, which every SDK release accepts. */
export function session(...requests) {
  return sessionAt('2024-11-05', ...requests);
}
