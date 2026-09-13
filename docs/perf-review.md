# Performance review (T45, 2026-09-12)

Three concerns the owner raised after the UX review, each measured before it was judged:
uncompressed JSON dragging the app, single dependencies deciding a route's latency, and
writes that wait for the server before the screen moves. This file is the record: the
method, what each measurement showed, what T45 changed, and what is still open.

## Method

Every number comes from a production build of the tree (`NEXT_DIST_DIR=.next-perf pnpm
build`, then `next start -p 3002` against the `winnow_test` database, never the dev server
and never the owner's port 3000), signed in as the test user, seeded with about a year of
use (300 transactions, 200 tasks, 60 days of meals, 12 habits, 8 goals, 40 events), at
393 × 852 in Chromium. Two network profiles: unthrottled, and a phone on ordinary 5G,
emulated at 60 ms round trip, 20 Mbit/s down, 10 up. Responses were recorded as HAR files;
paints and event durations came from the page's own `PerformanceObserver`; the server's share
came from Postgres statement logging on the test database; the 21 daily writes were sampled
ten times each, timed from the input event to the first frame showing the change and to the
frame showing the server's settled state.

## 1. Uncompressed JSON: cleared

Every compressible response over 1 KB travelled gzipped (3,177 of 3,450 responses; the rest
are woff2 fonts and PNG icons, which must not be gzipped). `next.config.ts` sets no
`compress` key, so Next's built-in gzip applies. The bundled food index from T31 (1.28 MB)
never reaches the browser: it lives in the server bundle behind `import "server-only"`, and
a food search is one 2 KB Server Action round trip. Brotli would save another 15 to 20
percent on the same bodies, but Next only does gzip; that is the proxy's job (see "Open").
Whether compression survives the deployed Tailscale path could not be measured: the deployed
app was down (a 502 behind a valid certificate, the HANDOFF §1 reboot condition).

## 2. Single dependencies: the client side of the wire

The server is not the bottleneck. SQL is 1 to 4 percent of a route's time, the slowest
statement anywhere 0.8 ms, and every daily page runs its queries together, except the
calendar, which chained six round trips (30 ms of an 85 ms document) and read its calendars
twice. Time to first byte is 31 to 86 ms everywhere. What decides latency, on the 5G
profile, cold:

| what                               | measured                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| first contentful paint             | 312 to 484 ms; the last thing it waits for is the largest font (154 to 173 ms)       |
| largest contentful paint           | 808 to 964 ms on six of eight routes, gated by the digest banner's client fetch      |
| interactive (the palette answers)  | 767 to 1,032 ms, decided by 33 to 38 chunk requests sharing six HTTP/1.1 connections |
| chunks per cold load               | 335 to 439 KB on the wire; react-dom 71 KB on every route, zod 63 KB on 13 of 23     |
| `/activity` document for 200 tasks | 1.27 MB decoded, 38 KB gzipped; 62 percent is repeated Tailwind class strings        |
| link prefetches per page           | 11 to 22, two per visible link; the eventual tap fetched the page fresh anyway       |
| fonts before first paint           | three faces preloaded, 146 KB                                                        |
| request overhead                   | a 765 byte session cookie on every request, re-issued in every response              |

Warm loads of the daily routes reach first paint in 96 to 188 ms and interactive in 361 to
624 ms; the chunk and font costs are paid once per build, since they are cached immutable.

## 3. Un-optimistic rendering: mostly fine, and one framework bug

Three writes were already optimistic and showed their change in 14 to 86 ms (ticking a task
on either surface, folding a card). Every other daily write settled in 121 to 324 ms on the
5G profile, inside the Doherty threshold and mostly inside the 200 ms target, so only one
earned an optimistic path: deleting or skipping a task (306 ms, the list sitting still after
a menu tap). The rest were kept with reasons: the gain is 130 ms or less, or the server
decides what the screen would have to guess (the streak on a habit log, the parsed food on an
unknown quick-add, the occurrences a repeat rule makes, the totals beside a transaction).

The large finding was elsewhere. After a write, the server answers in under 150 ms but the
revalidated state is intermittently never committed: logging water on `/meals`, in a headed
browser with the page focused, the total failed to land and the buttons stayed disabled for
the full 12 second window in 14 of 20 samples. React never commits the state until some
unrelated update re-renders the root, which is why writes that raise a toast unstick when the
toast leaves (4 or 8 seconds) and writes that raise none stay stuck. Every app-level cause was
ruled out with a measurement each. It is a known Next.js bug in the React reconciler Next
bundles (Next.js discussion 88767: Server Actions with `useTransition` hang in production
builds about a third of the time, since a mid-2025 React canary upgrade; reporters say
16.2.12 and 16.3.3 are still affected). The e2e suite never sees it because it runs the dev
server. Bumping `react` in this repo cannot fix it; only a Next release with a fixed
reconciler, or an app-level kick after each write, can. Open, with the owner.

## What T45 changed

- The digest is computed in the `(app)` layout's own `Promise.all` and passed to the banner,
  which renders nothing until the client has read its once-a-day dismissal (no hidden
  markup, so its text cannot shadow a page's own headings); the `getDigest()` action is
  gone. One Server Action POST per first load of the day became
  none, and the largest paint no longer waits a round trip.
- The calendar page runs calendars, event counts and the month's events together, and
  `getCalendars` reads the list once, seeding only on an empty result.
- Deleting or skipping a task leaves the list at once through the existing optimistic
  reducer (`applyTaskChange`, `{ kind: "toggle" | "remove", id }`), returning by itself if
  the write fails; the subtask field keeps its text on a dropped connection like the
  capture bars.
- JetBrains Mono is no longer preloaded: two faces before first paint, 106 KB instead of 146. The service worker's copy of the body font stays, because `public/offline.html` uses
  it and cannot name `next/font`'s hashed path; `sw.test.ts` holds that link.
- Prefetch is off on the section strips, the month and week steppers and the More sheet's
  rows; the four daily tabs and the sidebar keep it. Eight of nine prefetches on an
  Activity arrival became none; `LinkPending` still spins on a tap.
- The transaction, event, calendar-manager, habit, goal and goal-editor dialogs load with
  `next/dynamic` when first opened, so zod (63 KB) left `/calendar` and `/activity/habits`:
  13 routes carried it, 11 do.
- The Activity page passes its client components only the row fields they read
  (`ActivityTask`), about 30 KB less of a 146 KB payload at 200 tasks.

## Open

- **The stuck commits after writes** (section 3): try the newest Next 16.3 and keep it only
  if water lands 20 of 20 in the headed harness; otherwise a root-level component whose state
  is bumped once after every write, held by a test against a production build through
  `test:e2e:prod`.
- **Deployment configuration**: HTTP/2 at the proxy (which lifts the six-connection cap that
  stretches the chunk tail and compresses the cookie headers), brotli, and a cookieless
  origin for `/_next/static`. Docker and Tailscale changes, not app code.
- **`/activity` markup**: 693 KB of repeated `class` attributes and 239 KB of inline SVG in a
  1.1 MB document at 200 tasks. Moving the row variants into stylesheet utilities would
  cut it by half, against the convention of Tailwind classes in the markup.
- **zod on `/budget`, `/goals` and `/review`** through `use-proposal.ts`, which parses
  proposal payloads on the client; `/meals` and `/activity/routines` through dialogs on
  the same pattern as the six that now load on demand.
- **The digest on every render**: `computeDigest` runs on every authenticated render of
  every route, including its recurring-task upkeep, where before it ran once a day from the
  client. Cheap (a few ms of SQL) but a cookie-gated skip would make it free on the days it
  shows nothing.
- The per-goal plan reads on `/goals` (one query per goal), and `revalidateHubs()` plus
  `router.refresh()` both firing on the eleven settings writes.
