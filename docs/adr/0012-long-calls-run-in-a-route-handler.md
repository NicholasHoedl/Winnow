# ADR-0012: Long Outbound Calls Run In A Route Handler

**Status:** Accepted (T9a)
**Date:** 2026-08-04
**Amends:** ADR-0005, which chose a Server Action for outbound HTTP. That decision stands
for calls of Open Food Facts' length; this one carves out the case it did not anticipate.

## Context

ADR-0005 put the app's first outbound call in a Server Action, and gave three reasons: it
reuses the mechanism the app already has for client→server calls, a route handler would be
"a second, differently-shaped API surface that needs its own auth check", and there is no
CORS to reason about.

It also named the cost, precisely:

> The cost is that an OFF outage manifests as a _slow Server Action_, which blocks the
> React transition the calling dialog is in. The UI must therefore always show a pending
> state and must never gate the rest of the dialog on the search.

That is a fair trade at Open Food Facts' scale: a search times out at 6 seconds and a
barcode lookup at 4.

The AI companion (ADR-0011) breaks the arithmetic. Generating a plan takes **5–60 seconds**
in the normal case, not the failure case, and the timeout is 90. "Show a pending state" is
not a mitigation at that length — a Server Action holds the transition open for the whole
minute, and everything React would otherwise render in that tree waits with it.

## Decision

**An outbound call expected to take longer than a few seconds runs in a route handler,
called from the client with `fetch`.** Everything else stays exactly where ADR-0005 put it.

`POST /companion/generate` is the first and currently only instance.

The dividing line is duration, not subject matter. A Server Action is still the default
for every mutation in the app, including the ones this feature performs: `applyProposal`
and `discardProposal` are Server Actions, because writing rows is fast.

## Why the original objections do not apply here

**"A second API surface that needs its own auth check."** True, and the check is
`requireUserId()` — the same call every query module and every Server Action already makes,
and the same one the route handler at `api/calendar/[token]` deliberately does *not* use
because it authenticates by token instead. This is not a new auth model, it is one more
call site of the existing one. The app already has four route handlers.

**"Reuses the mechanism the app already has."** It does not, and that is the point. The
mechanism's defining behaviour — occupying a transition until it returns — is the thing
being avoided.

**"No CORS to reason about."** Unchanged. This is a same-origin `fetch` from the app's own
client to the app's own server; the provider is reached from the server, exactly as OFF is.

## Consequences

**Failure has to be re-shaped by hand.** A Server Action returns an `ActionResult` the
caller destructures. A route handler returns a `Response`, so the JSON body carries
`{ ok, error }` and the client maps it back to a toast. The typed failure taxonomy still
lives in `companion/ai-request.ts` and is still never thrown — ADR-0005's rule survives
intact, only its transport changed.

**No streaming, deliberately.** Streaming would improve *perceived* latency but solves
nothing about blocking, which is what this ADR is about. A JSON response and a pending
button are enough to ship; token streaming can be added inside this decision later without
revisiting it.

**Two call shapes now exist for client→server**, which is a real cost in a codebase that
has otherwise had exactly one. The mitigation is that the rule is short enough to remember
and stated here: **if it can take longer than a few seconds, it is a route handler.**

**Revalidation is not automatic.** A Server Action can call `revalidatePath`; a route
handler's response does not refresh the client router. `/companion` calls `router.refresh()`
after a successful generation, which a Server Action would have done implicitly.
