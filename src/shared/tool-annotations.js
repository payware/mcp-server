/**
 * MCP tool annotations, as the six combinations this server's tools actually fall into.
 *
 * Annotations are hints a client uses to decide how much to ask the user before running a tool: a
 * read can run unattended, a destructive call should be confirmed, a non-idempotent one should not
 * be retried blindly after a timeout. Every tool declares one of these as `annotations`, and
 * tests/tool-contract.test.js fails on a tool that does not. tests/tool-routes.test.js checks the
 * choice against the route the tool calls, so a GET cannot be declared destructive or a DELETE
 * read-only.
 *
 * All four hints are always set. The protocol defaults are the cautious ones (not read-only,
 * destructive, open world), so a tool that left them out would be presented as more dangerous than
 * it is, and a directory that lists servers requires them to be explicit.
 *
 * "Open world" means the tool reaches the payware API, and through it real payers, merchants and
 * money. The local tools - keys, tokens, code samples, formatting, callback simulation - do not.
 */

/** Computes something locally and calls nothing. */
export const LOCAL = Object.freeze({
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false
});

/** Reads from the payware API and changes nothing. */
export const READS = Object.freeze({
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true
});

/**
 * Adds something that a repeat call returns rather than adds again: a shareable link, which the
 * server mints on first request and records on the transaction, or a downloaded file saved locally.
 */
export const ADDS = Object.freeze({
  readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true
});

/** Creates something new each time it is called: a transaction, a product, a report run. */
export const CREATES = Object.freeze({
  readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true
});

/** Overwrites, cancels or deletes. Repeating it changes nothing further. */
export const CHANGES = Object.freeze({
  readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true
});

/**
 * Moves a payment forward irreversibly: processing it as the payer, or finalizing it as the
 * institution. A retry after a timeout must not be automatic - the first call may have landed.
 */
export const COMMITS = Object.freeze({
  readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true
});
