# Security Risk Assessment

**Assessed 2026-08-25**, against the deployed stack: the app and Postgres in Docker, inside
Ubuntu under WSL2 on the Windows deploy host, published to a private Tailscale network.

**Method.** Manual review of the authentication choke point, every route handler, the
outbound request paths, secret storage and response headers — plus two live checks against
the running host: a TCP reachability test over the tailnet, and `pnpm audit` with
attribution to top-level packages. Findings below are grounded in one of those, not in
general advice.

**This document deliberately contains no network identifiers** — no tailnet name, no
addresses, no tokens. Everything here is either discoverable from the source or is a
configuration fact the owner already knows.

**Point-in-time.** It describes the system as of the date above. Re-run the checks in
§"How to re-check" after any change to the deployment.

---

## Verdict

**The application itself is well-contained**, and the mistakes usually made in a
self-hosted project of this shape have not been made here. The most valuable single action
is not in the app at all — it is a Tailscale ACL.

| #   | Finding                                                                        | Severity       | Where                                         | Status         |
| --- | ------------------------------------------------------------------------------ | -------------- | --------------------------------------------- | -------------- |
| 1   | Windows file sharing (SMB/NetBIOS) is reachable by every device on the tailnet | **High**       | Tailscale config, not the app                 | Open           |
| 2   | Server-side request forgery via the custom AI provider URL                     | **Medium**     | `preferences/validation.ts`, `ai-settings.ts` | Open           |
| 3   | AI provider API key stored in plaintext at rest                                | **Medium**     | `preferences/schema.ts`                       | Open           |
| 4   | Known vulnerabilities on production dependency paths                           | **Low–Medium** | `next`, `next-auth`                           | Open           |
| 5   | `unsafe-inline` in the production `script-src`                                 | **Low**        | `next.config.ts`                              | Open, accepted |

---

## 1. SMB and NetBIOS are exposed to the whole tailnet — High

**What was found.** A TCP reachability test from another tailnet device found ports **445
(SMB, Windows file sharing)** and **139 (NetBIOS)** open on the deploy host. Remote Desktop,
SSH, Postgres and the app's own port were all correctly closed.

**Why it happens.** This is not caused by Winnow. **Tailscale exposes the entire host to the
tailnet by default** — `tailscale serve` publishes the app, but every other listening port on
that machine stays reachable to tailnet members. A default personal tailnet permits every
device to reach every port on every other device.

**Impact.** Any device on the tailnet can attempt SMB against the deploy host. Today that is
a small set of the owner's own devices, so exposure is limited — but it grows with every
device added, every node shared, and it becomes the pivot if any one of those devices is
compromised. SMB has a long history of severe remote vulnerabilities.

**Remediation.** Define **Tailscale ACLs** in the admin console restricting which devices may
reach which ports, rather than relying on the permissive default. Limiting the deploy host to
the served application port closes this finding entirely. This is a configuration change; no
code is involved.

**Secondary hardening**, independent of Tailscale: disable SMB file sharing on the host if it
is not used, or scope it to the local network only via Windows Firewall.

---

## 2. Server-side request forgery via the custom AI provider URL — Medium

**What was found.** The AI provider's base URL is validated only as:

```ts
baseUrl: z.string().trim().max(500)
```

A length check. There is no scheme restriction, no host allowlist, and no rejection of
private or loopback addresses. `resolveBaseUrl` passes the submitted value straight through
whenever the provider is `custom`, and the server then issues a request to it.

**Impact.** A caller who can reach the settings form can make the **server** issue HTTP
requests to any address the server can reach — loopback services on the deploy host, the home
LAN, or other tailnet devices. The response is not necessarily returned to the caller, but the
request is made, which is enough for port and service discovery from inside the network.

**Severity is Medium rather than High because the app is single-user and has no sign-up.**
This is not an entry point. It is a **post-compromise pivot**: it converts "an attacker has
the app account" into "an attacker can probe the private network from inside it".

**Remediation.** Validate the URL where it is accepted: require `https:` (or `http:` only for
explicitly local development), parse it as a URL rather than a string, and reject hosts that
resolve to loopback, link-local, or RFC1918 ranges unless deliberately allowed. Note that a
robust fix resolves the hostname and checks the resulting address, because a DNS name can
point at a private address.

**Tension worth recording:** ADR-0011 deliberately supports pointing the companion at a
self-hosted model, which usually _is_ a local address. A blanket ban on private addresses
would remove a supported use case. The honest fix is an explicit opt-in for a local endpoint
rather than accepting any string by default.

---

## 3. AI provider API key is stored in plaintext — Medium

**What was found.** The column is:

```ts
aiApiKey: text("ai_api_key").notNull().default("")
```

No encryption at rest.

**In its favour**, the key is handled well everywhere else: it is write-only in the UI, is
never sent to the browser, and is excluded from the settings schema so a form submission
cannot clear it by accident. There is an e2e test asserting it never reaches the client.

**Impact.** The key is readable by anyone with database access — and, more realistically, it
is present in plaintext in **every `scripts/backup.sh` dump**, which is gzipped SQL on disk.
A backup copied to another machine or a cloud drive carries the key with it.

**Remediation options**, in increasing order of effort:

- Treat backup files as secret material: keep them on the host, and encrypt them if they are
  copied anywhere.
- Encrypt the column at rest with a key held in `.env`, so a database dump alone is not
  sufficient to recover it.

---

## 4. Known vulnerabilities on production dependency paths — Low–Medium

`pnpm audit` reports 50 advisories (3 critical, 24 high, 22 moderate, 1 low). **Attribution
matters more than the total**, so the paths were traced to their top-level packages:

| Top-level package                                                  | Paths | Ships in the runtime image? |
| ------------------------------------------------------------------ | ----- | --------------------------- |
| `eslint-config-next`                                               | 207   | **No** — dev tooling        |
| `shadcn`                                                           | 81    | **No** — devDependency      |
| **`next-auth`**                                                    | 24    | **Yes**                     |
| **`next`**                                                         | 17    | **Yes**                     |
| `@vitejs/plugin-react`, `eslint`, `vitest`, `@tailwindcss/postcss` | 21    | **No**                      |

The Dockerfile's runtime stage copies only `.next/standalone`, `.next/static` and `public` —
it does not copy `node_modules` — so the dev-tool advisories are not in the deployed image.
They still run on the development machine, which is a smaller but real concern.

The `next` and `next-auth` paths are in production. Reachability was not assessed: a
transitive advisory is only exploitable if the vulnerable code path is actually used.

**Also worth knowing:** `next-auth` is pinned to a **5.x beta** release. That is the library
holding the session cookies.

**Remediation.** Re-run `pnpm audit` after dependency updates and prioritise the `next` /
`next-auth` paths. Treat the dev-tool advisories as a supply-chain concern for the laptop
rather than for the deployment.

---

## 5. `unsafe-inline` in the production `script-src` — Low, accepted

The production policy is `script-src 'self' 'unsafe-inline'`; `unsafe-eval` is development
only. `unsafe-inline` weakens the Content-Security-Policy's value as a second line of defence
against cross-site scripting.

`next.config.ts` already records why: removing it requires generating a per-request nonce in
`proxy.ts`. For a single-user application with no user-generated content rendered as HTML,
that is a reasonable trade rather than an oversight. Recorded so it is a decision rather than
an omission.

---

## What is already right

Listed so that none of it is "fixed" into something worse:

- **Postgres publishes no port** and was verified unreachable over the tailnet.
- **The app is not directly reachable either** — only Tailscale's HTTPS proxy reaches it. It
  binds `127.0.0.1` deliberately.
- **The calendar feed**, the only endpoint that answers without a session, uses a 256-bit
  CSPRNG token (`randomBytes(32)`), answers **404 identically** for unknown, malformed and
  empty tokens, never falls back to a session, and never sets a cookie.
- **`proxy.ts` excludes `/api`** from the coarse auth gate — and both real route handlers
  under it authenticate themselves. This was checked rather than assumed, because an excluded
  namespace is exactly where an unauthenticated handler would hide.
- **Passwords use bcrypt.** The sign-in path additionally pads its failure timing to close a
  user-enumeration oracle, and applies a delay floor instead of a lockout (ADR-0018).
- **`frame-ancestors 'none'`** plus `X-Frame-Options: DENY`.
- **The service worker caches nothing user-owned** — no pages, no RSC payloads, no API
  responses. Only immutable build assets and the offline page.

---

## The risk most likely to actually matter

None of the above. It is that **the phone holds a permanently signed-in copy of the app and
is a member of the tailnet.** A lost or stolen unlocked phone yields the owner's finances,
calendar and network membership at once, with no exploitation required.

Mitigations are ordinary: a device passcode and biometrics, and the ability to remove that
device from the tailnet remotely through the Tailscale admin console.

Worth noting that **until T21 there was no way to sign out on a phone at all** — the action
existed only in a sidebar hidden below 768px. That fix matters more than it looked at the
time.

---

## Scope and limits

**Not assessed:** penetration testing of any kind, the Tailscale client itself, Windows host
hardening beyond the port check, physical security, the exploitability of individual
dependency advisories, and the iOS PWA's local storage.

**Assessed read-only.** No configuration was changed and no intrusive testing was performed.
The only active check was a TCP connection attempt against the owner's own host from the
owner's own device.

## How to re-check

- **Port exposure:** from another tailnet device, attempt TCP connections to the deploy host
  on 445, 139, 3389, 22, 5432 and the app port. Only what you intend to serve should answer.
- **Dependencies:** `pnpm audit --audit-level moderate`, then attribute paths to top-level
  packages before judging severity.
- **Unauthenticated surface:** enumerate `src/app/api/**/route.ts` and confirm each either
  authenticates or is deliberately public with a credential of its own. `proxy.ts` does not
  cover that namespace.
