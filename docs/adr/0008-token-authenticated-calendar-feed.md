# ADR-0008: A Token-Authenticated Calendar Feed, In Floating Time

**Status:** Accepted (T5c-a)
**Date:** 2026-07-28

## Context

`SPEC.md` §6 defers "calendar import/sync (Google/Apple Calendar, etc.)" along with the
other third-party integrations. Its own preamble sets the condition for revisiting —
"revisit only after the MVP is in real daily use" — and it is, so this is a deliberate
revisit rather than a violation. Same move T6b made with offline.

The improvement plan parked the feature on one blocker: *"a subscribe feed means a public
unauthenticated URL and has to invent tokens or signed URLs."* Half of that is wrong and
worth correcting, because it made the feature look bigger than it is:

- **Nothing becomes public.** The subscriber is the user's own iPhone, which is on the
  tailnet. No public DNS record, no port-forward, no Funnel — SPEC §6's hard constraint is
  untouched, and the feed is unreachable from the internet exactly like the rest of the app.
- **The token part is real.** iOS Calendar polls a URL with no cookie jar. `requireUserId()`
  was the only authentication in the codebase and there was no `crypto` import in `src/` at
  all, so a credential of any kind is a first.

Three decisions had to be made together: how the feed authenticates, how times are
represented, and whether to take an iCalendar library.

## Decision

### 1. A bearer token in the URL

`calendar_feed_tokens` (migration `0021`): one row per user, 256 bits from
`randomBytes(32)`, base64url. The URL is `/api/calendar/<token>`.

- **Under `/api`** because `proxy.ts`'s matcher already excludes that prefix. No auth regex
  is widened. That matters: the matcher's own comment warns that its extension class
  matches any *route* ending in those characters, so adding `.ics` there would have
  exempted far more than one endpoint.
- **Every miss is a 404** — unknown token, malformed token, empty token, identically. A 401,
  or a different body for "that token used to exist", confirms which tokens are real.
- **Regenerating is the only revocation.** A bearer URL cannot be un-shared; the answer to a
  leaked link is to make it stop working. The settings copy says so before asking.
- **The token is in the JSON export.** Deliberate: a restored backup should leave an
  existing subscription working rather than silently going dead. The cost is that the export
  file now carries a live credential — one that is useless without tailnet access, and which
  sits alongside a complete copy of the data it protects.

### 2. Times are emitted as floating local time

`DTSTART:20260706T090000` — no `Z`, no `TZID`, no `VTIMEZONE`. All-day events use
`VALUE=DATE`.

This is the faithful serialization of this app rather than a shortcut. The calendar is
**wall-clock by design** (ARCHITECTURE §3: "a 09:00 standup stays 09:00 across a DST
boundary instead of drifting"), and every view renders in `user_preferences.timeZone`,
never in the viewing device's zone. Floating time never converts either, so a subscribed
device shows the same 09:00 the app shows. A `TZID` would make the feed disagree with the
app it came from.

It also collapses two of the five known RRULE gaps outright: no per-event zone is needed,
and `UNTIL` must be floating when `DTSTART` is — so the inclusive date-only
`recurrence_end_date` maps straight to `UNTIL=<date>T235959` with no UTC conversion and no
off-by-one. The remaining three are closed in `rruleFor`: BYDAY is derived from the anchor
when the mask is `0`, the nth-weekday ordinal is re-derived, and `COUNT` is simply never
emitted because `UNTIL` says the same thing.

**The stated cost:** a consumer in another timezone shows wall-clock time rather than
converting it. For a single-user personal calendar that is the intent.

### 3. No iCalendar dependency

`src/modules/calendar/ical.ts` is hand-written and **write-only**. ADR-0006's bar again — a
new runtime dependency needs an argument, not a preference — and the argument does not
arrive for writing: escaping, octet-safe folding, and an RRULE built from five columns is a
few dozen lines of well-specified work.

## Consequences

- **The nth-weekday derivation had to be extracted before the writer existed.** The ordinal
  and the is-it-the-last flag are not stored; `expandOccurrences` re-derives them from the
  anchor every call. A second, independent derivation in the writer could publish "last
  Friday" for a series the app draws on the 4th. `nthWeekdayOf` in `service.ts` is now the
  single source, and breaking it fails tests on both sides — verified by doing exactly that.
- **The feed cannot resolve a session**, so `getCalendarFeedData`, `preferencesFor` and
  `buildCalendarIcs` all take an explicit `userId`. `rangeOccurrences` was already split
  this way; the pattern just has a second reason to exist now.
- **The feed publishes RULES, not occurrences.** It is the only calendar read that does not
  go through `rangeOccurrences` — expanding first would throw away the RRULE that is the
  entire point, and bind a feed to a date range it has no business having.
- **A 21st user-owned table.** `USER_TABLES` derives itself so the export and import picked
  it up with no edit; `clear.ts` and `exportUserData` are hand-written and did not, and
  `coverage.test.ts` failed on both the moment the table appeared. That is the T6a machinery
  doing its job unprompted.
- **Correctness is not machine-provable here.** Golden-string tests pin the output and one
  test cross-checks the RRULE's ordinal against dates the real expander produces, computed
  by a deliberately different method. Proving the RRULE *means* what a consumer will read
  needs an evaluator we did not take. The acceptance bar is therefore subscribing from iOS
  Calendar and looking at it.

## Alternatives considered

**`TZID` plus a generated `VTIMEZONE`.** The conventional answer, and correct for a
traveller. Rejected because it would disagree with the app's own rendering, and because
generating a conformant `VTIMEZONE` for an arbitrary IANA zone — with historical DST
transition rules — is real work in service of a case a single-user home calendar does not
have. Emitting `TZID` *without* `VTIMEZONE` is non-conformant, and relying on consumers to
resolve the name anyway is a bet, not a design.

**UTC (`…Z`) for everything.** Simple and unambiguous for one-off events, and wrong for
recurring ones: a 09:00 series emitted as an instant plus an RRULE drifts by an hour the
moment DST changes, which is precisely the bug the wall-clock model exists to avoid.

**A signed URL instead of a stored token.** No table, and revocation would need a secret
rotation that invalidates everything at once. A stored token is one row, revocable on its
own, and readable — which matters when the user has to paste it into a phone.

**Putting the token on `user_preferences`.** It is a credential with a lifecycle, not a
preference, and it does not belong in a form that saves other fields.

## When to revisit

- **If `.ics` import is ever wanted.** Reading an arbitrary RRULE back is not the mirror of
  writing one: `COUNT`, `BYSETPOS`, multi-`BYDAY`-with-ordinals and sub-daily frequencies
  have nowhere to live in five columns. That is a *representability* problem, and the honest
  answers are a raw-rule passthrough column or rejecting what does not fit — either way a
  different feature, and the point where a library earns its place.
- **If the app ever renders in the device's zone** rather than the saved preference. Floating
  time stops being faithful the moment that changes, and `TZID` becomes correct.
- **If a second feed is ever wanted** (per-calendar, or read-only sharing), the single-row
  `user_id` uniqueness is the constraint to lift first.
