import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * A local stand-in for the payware API.
 *
 * **Why a real HTTP server rather than a mocked axios.** The failures this package actually has are
 * not in the branch logic - they are in what goes on the wire: a `contentSha256` computed over a
 * different string than the body (`ERR_INVALID_CONTENT_HASH`, the single most common integration
 * failure here), a field spelled the way the docs used to spell it, a header omitted. A mock that
 * intercepts before serialization cannot see any of those, because they happen during
 * serialization. Pointing `PAYWARE_SANDBOX_URL` at a real socket exercises the whole path - JWT
 * signing, deterministic JSON, headers, body - with nothing stubbed and no network involved.
 *
 * It also verifies the content hash the way the server does, so a test that sends a body gets the
 * hash checked for free rather than having to assert on it.
 *
 * With a `model` (helpers/payware-model.js) it is a model of payware rather than a recorder: it routes,
 * authenticates and validates as the server does, refuses what the server refuses, and answers with
 * the server's DTO shapes. Without one it answers whatever is queued, which only the generated-program
 * test still uses (those programs take their base URL from the test).
 */
let sequence = 0;

export class FakePaywareServer {
  constructor({ publicKey, model = null, label = 'api' } = {}) {
    this.publicKey = publicKey;
    this.model = model;
    this.label = label;
    /** Every request received, in order, for assertions. */
    this.requests = [];
    /** Queued responses: { status, body, headers }. Falls back to `defaultResponse`. */
    this.queue = [];
    this.defaultResponse = { status: 200, body: {} };
    this.server = null;
  }

  /** Queue one response for the next request. Call repeatedly to script a sequence. */
  respondWith(status, body = {}, headers = {}) {
    this.queue.push({ status, body, headers });
    return this;
  }

  /** The most recent request, which is what a single-call test wants. */
  get lastRequest() {
    return this.requests[this.requests.length - 1];
  }

  async start() {
    this.server = createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const described = this.#describe(req, rawBody);
        this.requests.push(described);

        // The model refuses first, as payware would, without consuming a queued answer; a queued
        // answer replaces the model's own, which then moves no state.
        const refusal = this.model?.refuse(described);
        const next = refusal
          || this.queue.shift()
          || (this.model ? this.model.respond(described) : this.defaultResponse);
        described.response = { status: next.status, body: next.body };
        res.writeHead(next.status, {
          'Content-Type': 'application/json',
          // The server's own header (config/logging/CorrelationIdInterceptor); it sends no x-request-id.
          'X-Correlation-ID': 'test-correlation-id',
          ...next.headers
        });
        res.end(Buffer.isBuffer(next.body) || typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
      });
    });

    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address();
    this.url = `http://127.0.0.1:${port}`;
    return this.url;
  }

  async stop() {
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
      this.server = null;
    }
  }

  /**
   * Decode the request into something a test can assert on, and check the content hash while we
   * have both halves in hand.
   */
  #describe(req, rawBody) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    let header = null;
    let payload = null;
    let signatureValid = null;
    if (token) {
      const decoded = jwt.decode(token, { complete: true });
      header = decoded?.header ?? null;
      payload = decoded?.payload ?? null;
      if (this.publicKey) {
        // The signature only. The audience has two legal forms - 'https://payware.eu', or on an
        // ISV's on-behalf call the merchant's partner id, with the OAuth2 token as `sub`
        // (OncePerRequestPaywareAuthorizationFilter) - so a test that cares asserts the one it
        // expects on `payload`.
        try {
          jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
          signatureValid = true;
        } catch {
          signatureValid = false;
        }
      }
    }

    // The server's own check, reproduced: the hash in the JWT header must be over the EXACT bytes
    // of the body. `null` when there is no body (a GET carries no hash, by design).
    let contentHashMatches = null;
    if (rawBody) {
      const expected = createHash('sha256').update(rawBody, 'utf8').digest('base64');
      contentHashMatches = header?.contentSha256 === expected;
    }

    let json = null;
    if (rawBody) {
      try { json = JSON.parse(rawBody); } catch { /* not JSON - leave null, rawBody is still there */ }
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    return {
      seq: sequence++,
      host: this.label,
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      // Query params can legitimately repeat (invitation status filters); searchParams collapses
      // those, so keep the raw list too.
      queryAll: [...url.searchParams.entries()],
      headers: req.headers,
      rawBody,
      json,
      jwt: { header, payload, signatureValid },
      contentHashMatches
    };
  }
}

/**
 * Run `fn` with the environment a tool needs, restoring whatever was there before.
 *
 * Restoring matters more than it looks: the test runner shares one process across files, and a
 * leaked `PAYWARE_PARTNER_TYPE` makes an unrelated file's tools authenticate as the wrong role -
 * which shows up as a confusing assertion failure somewhere else entirely.
 */
export async function withEnv(vars, fn) {
  const previous = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
