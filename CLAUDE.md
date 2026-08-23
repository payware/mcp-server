# CLAUDE.md

## Purpose
Official MCP (Model Context Protocol) server for the payware payment API: `@payware/mcp-server` (published to npm, v1.2.0). Lets AI assistants (Claude Code, MCP Inspector, etc.) interact with payware - create transactions, manage products, run reports - on behalf of three partner roles.

## Stack
Node.js, Express. Key deps: `@modelcontextprotocol/sdk`, `jsonwebtoken` (RSA-signed JWTs), `axios`, `http-proxy-middleware`.

## Three deployment modes
| Mode    | Command         | Purpose                                     |
|---------|-----------------|---------------------------------------------|
| Server  | `npm start`     | Direct MCP server over stdio                |
| Proxy   | `npm run proxy` | HTTP/REST proxy for browser/web tools       |
| Bridge  | `npm run bridge`| mcp-proxy bridge (used by Inspector etc.)   |

Dev variants: `npm run dev`, `npm run proxy:dev` (with `node --watch`). `npm run inspector` launches the MCP Inspector against `mcp-proxy`.

## Three partner roles
Tools are organized by partner type, mirroring `src/`:
- `src/merchant/` - merchants accepting payments (50 tools)
- `src/isv/` - ISVs managing many merchants: OAuth2, POI, merchant onboarding (63 tools)
- `src/payment-institution/` - FIs running A2A transfers (29 tools)

68 distinct tools; the per-role counts overlap on 10 shared auth/utility tools. Recount rather than
trusting those numbers - the snippet is in `docs/MCP_TOOLS_DOCUMENTATION.md` under TOTAL TOOL COUNT.

Plus `src/auth/`, `src/config/`, `src/core/`, `src/shared/`, `src/tools/`, `src/utils/`. Entry points: `src/index.js`, `src/proxy-server.js`, `src/mcp-proxy.js`.

**Adding a tool** means two edits: write the module, and add it to the role's `index.js` tool array.

The `getXTools()` if/else chain in each `index.js` looks like a third required edit and is not one -
**every branch assigns `newName = tool.name`, which is what `newName` already holds**, so the whole
chain renames nothing and a tool whose prefix has no branch behaves identically to one that does.
`payware_generate_*` has had no branch since it was added and is unaffected. Leave it alone or delete
it wholesale; do not "fix" a missing branch, and do not make a branch actually rename something -
`tests/tool-contract.test.js` pins the no-op, because a rename here silently changes tool names for
every connected client.

## Tests
`npm test` - 84 tests, node's built-in runner, no dependencies and **no credentials**. The suite
generates an ephemeral RSA key and points itself at a local fake payware server, so it must pass with
no `.env` and no `keys/`; a test that needs a real key is testing the wrong thing. Runs on every
push and before every publish (`.github/workflows/`).

| File | What it protects |
|---|---|
| `tests/tool-contract.test.js` | Every tool's shape, unique names, declared parameters, and that role-to-role differences are *declared* rather than accidental. This is what found the five broken ISV tools. |
| `tests/request-contract.test.js` | What goes on the wire. Runs real tool code against a local HTTP server with nothing stubbed, and checks `contentSha256` against the body on every signed request. |
| `tests/api-errors.test.js` | The error helpers: `errorCode` (not `code`), retryability, `Retry-After` parsing. |
| `tests/json-serializer.test.js` | Serialization determinism, which the content hash depends on. |

**Assert the verb and the path**, not just the response. Three of the five bugs found were tools
calling routes that do not exist (`DELETE /transactions/{id}`, `GET /transactions-history` with
filters, `POST /transactions/{id}/simulate-callback`). Nothing but an explicit path assertion catches
that class - the code reads fine and the mock answers whatever it is told to.

## Shared error handling (`src/shared/api-errors.js`)
`describeApiError(error, operation)` for modules that throw, `apiErrorResult(error)` for modules that
return `{success:false}`. Use them rather than rebuilding either shape inline.

**The bug they exist to prevent:** payware's error body is `{errorCode, message, correlationId}` -
there is no `code` property. Fourteen modules read `error.response?.data?.code`, so the
machine-readable half of every payware error was `undefined` while the message still came through,
and anything branching on the code silently took the else branch forever. They also surface what a
flat message string throws away: HTTP status, `Retry-After` seconds, and whether retrying is
meaningful at all.

## Authentication (non-obvious)
- RSA-signed JWTs with **SHA-256** content hash (`contentSha256` header) - upgraded from MD5 in v1.2.0. `generateContentMd5` survives in `core/auth/jwt-token.js` marked DEPRECATED, for inspecting legacy tokens only.
- Per-role private keys in `keys/` (gitignored). Filenames map env to role: `sandbox-payware-{merchant,isv,pi}-private-key.pem`, `api-payware-merchant-private-key.pem`.
- Errors to know: `ERR_INVALID_CONTENT_HASH`, `ERR_MISSING_CONTENT_HASH`.
- `shared/auth-headers.js` builds headers for any role. Four older private copies of the same
  function still live in `shared/{products,data,deep-links,logs}/*.js`; they differ in small ways
  that may or may not be accidental, so consolidating them is its own change, not a drive-by.

## Contract facts that bite (verified against server/ 2026-08-23)
- **The MERCHANT's plan governs an ISV's on-behalf call.** Since 2026-08-21 acting on behalf is not
  sufficient by itself - an ISV serving a Basic merchant gets 403 on transactions, products, shops
  and reports. `/api/transactions-history` gained the same gate, having previously had none.
- **Amounts follow their currency.** Every amount/fee is a decimal string at that currency's minor
  unit. Never assume two decimals, never compare as strings, never re-round a `fee` before echoing
  it at finalize (`ERR_FEE_MISMATCH`). Product prices became strings on 2026-08-16.
- **Callbacks omit rather than zero.** `@JsonInclude(NON_NULL)`: a missing `fee` means unknown, not
  free. `deliveryAddress` left the callback on 2026-08-07 and lives only on transaction history.
  Deduplicate on `(transactionId, callbackType)`.
- **429 is reachable on every endpoint**, not just transaction history.

## Configs at root
- `mcp-config.json`, `claude-code-config.json`, `payware-mcp-config.json` are example/template configs for different MCP clients. Pick the one that matches your client and copy it where the client expects.

## docs/ convention
- Active reference docs at root of `docs/`:
  - `MCP-SETUP.md` - configuration guide
  - `MCP_TOOLS_DOCUMENTATION.md` - full tool reference (945 lines; grep before designing new tools)
  - `README-proxy.md` - proxy mode docs
  - `GITHUB-WORKFLOW.md` - publishing flow (GitLab has full history; GitHub gets squashed releases)
- Completed/historical reports in `docs/implemented/`.

## Cross-repo links
- **Calls** -> `server/` REST APIs (sandbox or prod, depending on which key/env is loaded).
- **`internal-docs/documentation/` is a vendored snapshot of `kb/`**, not a source of truth. It is
  where tool-description drift comes from: a stale page here renders fine and describes an API that
  used to exist. See `internal-docs/documentation/SNAPSHOT.md` for the sync date and the re-sync
  command; re-sync before trusting it, and diff `tech/details/` afterwards - anything that changed
  there means a tool description in `src/` is now wrong.

## Heads-up
- `keys/*.pem` and `keys/*.key` are gitignored. Never commit real keys here. Sandbox keys are intentionally separate from production keys.
- Published to npm as `@payware/mcp-server`. Bumping version requires follow-through on the publishing workflow (`docs/GITHUB-WORKFLOW.md`).
