# ADR-0018: A Delay Floor On Failed Sign-In, And Deliberately No Lockout

**Status:** Accepted
**Date:** 2026-08-17
**Relates to:** ADR-0002 (the tailnet is the security perimeter)

## Context

A pre-deploy audit found no rate limiting, lockout, or delay of any kind on the login
action. A single bcrypt-checked credential with unlimited attempts.

ADR-0002 already answers most of this: the app is unreachable except from devices joined to
the tailnet, which "sidesteps an entire category of hardening work (brute-force protection,
public TLS management, exposed-service patching)". An attacker who can reach the login form
has already joined the tailnet, at which point the password is not the interesting control.

But "the network handles it" was never written down as applying to _this_ specifically, and
an omission that happens to be defensible reads identically to one nobody considered.

There is also a second, smaller finding in the same code. `authorize()` had three failure
paths with two different costs: a malformed payload and an unknown email both returned
before bcrypt ran, while a wrong password returned after it. The gap between ~0ms and
~100ms is a **user-enumeration oracle** — it tells you whether an email exists.

## Decision

**A delay floor on failure. No lockout, no counter, no stored attempt state.**

`FAILED_SIGN_IN_FLOOR_MS` in `src/lib/auth.ts` is 500ms, and every failure path returns
through one `reject()` helper that pads the attempt out to it.

A floor rather than an added delay, because the floor is what closes the enumeration
oracle: padding both the fast path and the slow path to the same figure makes them
indistinguishable, without keeping a dummy bcrypt hash in step with the real cost factor.

**A lockout was rejected outright, not deferred**, and this is the part worth preserving:

> There is no password-reset flow in this app. There is no sign-up, no reset email, no
> recovery code — `scripts/seed-user.ts` is the only thing that has ever created an account.
> So locking the single account means recovering through a shell on the Postgres container.

On a phone, five fat-fingered attempts is an ordinary morning. A lockout would convert a
typo into an outage of the user's own life-organizer, recoverable only from the machine it
runs on — which, on the day the app is being used from a phone away from home, is no
recovery at all. That is a worse failure than the one it defends against, given the tailnet
is already the perimeter.

## Consequences

- A wrong password takes at least half a second. Deliberate and barely perceptible; it
  applies only to failures, so a correct sign-in is unchanged.
- **Adding a fourth failure path means routing it through `reject()` too.** Nothing enforces
  this — a bare `return null` would silently reopen the timing gap. The comment at the call
  site says so; this is the other copy of that warning.
- The floor is a constant, not a preference. There is no setting for it, and there should
  not be — a per-user knob on a single-user app is a settings row with one reader.
- Brute-force protection remains, as ADR-0002 intended, a property of the network rather
  than of the app. If Winnow is ever exposed beyond the tailnet — Tailscale Funnel, a public
  reverse proxy, anything in that class — **this decision must be revisited before that
  happens, not after.** A 500ms floor is not a defence against an internet-facing login.

## Alternatives Considered

- **Lockout after N attempts.** Rejected above. The absence of a reset flow is the whole
  argument; if one is ever built, this is worth reopening.
- **Nothing but an ADR.** Considered seriously, and it would have been honest. Rejected
  because the enumeration oracle was a real, separate finding with a fix cheap enough that
  documenting it instead of closing it would have been a poor trade.
- **A stored attempt counter with exponential backoff.** All of the lockout's self-DoS risk,
  plus a column and a write on every failed login, to defend a form that is already behind a
  private network.
