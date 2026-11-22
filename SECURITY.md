# Security Policy

## Supported versions

Security fixes are released only for the latest version of `@payware/mcp-server` on npm. Older versions do not receive fixes; upgrade to the latest release.

## Reporting a vulnerability

Do not open a public GitHub issue, pull request or discussion for a security problem.

Report it privately through GitHub private vulnerability reporting: open the [Security tab](https://github.com/payware/mcp-server/security) of this repository and choose "Report a vulnerability".

Please include:

- the affected version and how you run the server (stdio, proxy, bridge)
- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- whether the issue is already public or known to others

## What to expect

- Acknowledgement within 3 business days.
- An initial assessment and severity rating within 10 business days.
- If you have an agreement with payware, the response times in that agreement apply.
- Fixes are prioritised by severity; critical and high findings are handled first.
- We will keep you informed of progress and agree a disclosure date with you. We ask that you do not disclose the issue publicly until a fix is released.
- With your permission, we will credit you in the release notes.

## Scope

In scope:

- the source code in this repository and the `@payware/mcp-server` npm package
- handling of credentials and private keys by the server (`.env`, key files, JWT creation)
- the local proxy and bridge components (`src/proxy-server.js`, `src/mcp-proxy.js`)

Vulnerabilities in the payware API or platform itself are also welcome through the same channel.

Out of scope:

- issues that require an attacker to already control the machine running the server or its `.env` file
- vulnerabilities in third-party dependencies with no demonstrated impact on this server (report those upstream)
- denial of service through excessive requests to the payware sandbox
- social engineering of payware staff or partners

## Safe harbour

We will not pursue legal action against anyone who studies the source code in this repository or the `@payware/mcp-server` package in good faith and reports a vulnerability under this policy. Use of the payware API, the sandbox and our websites remains governed by the terms that apply to them at https://legal.payware.eu.
