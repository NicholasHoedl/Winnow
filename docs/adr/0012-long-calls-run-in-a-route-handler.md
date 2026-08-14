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

`POST /api/companion/generate` is the first and currently only instance. (It was
`POST /companion/generate` until T13 — see the amendment at the foot of this ADR. The rule
is unchanged; only the address is.)

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


---

## Amended 2026-08-14 (T13): the endpoint moved to `/api`

`POST /companion/generate` is now `POST /api/companion/generate`. **The decision above is
untouched** — this is where the one instance lives, not what the rule says.

It moved because T13 disperses the companion's four jobs onto the pages of the artifacts
they produce, so four pages call this endpoint. An endpoint addressed by one page's route
segment is a lie once that page is not the only caller, and a falsehood once that page is
deleted.

**One consequence is worth knowing, because it is a security-shaped thing that is not a
security change.** `proxy.ts`'s matcher deliberately excludes `/api` (see
`api/calendar/[token]`, whose comment explains why the exclusion is safer than widening the
regex). At `/companion/generate` the proxy caught a request with no session and 307'd it to
`/login` before the handler ran. At `/api/companion/generate` it does not.

Nothing is less protected: `requireUserId()` was always the authoritative check, runs first,
and is unchanged. But it THROWS, and an uncaught throw in a route handler is a **500** — so
the handler now catches it and answers **401** with the same `{ ok: false, error }` body
every other failure uses. The client reads that body and never inspects `response.ok`, so a
signed-out request surfaces as a toast rather than a crash. A 500 meaning "you are signed
out" is precisely the sort of misleading signal this repo has already lost time to.
