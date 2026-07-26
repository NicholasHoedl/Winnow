# ADR-0005: Open Food Facts From A Server Action

- Status: Accepted
- Date: 2026-07-25

## Context

The meals module's real problem is that the food library starts empty and every food
must be typed in by hand, macro by macro. Until that's fixed, nothing else about the
module matters much. Open Food Facts (OFF) is a free, open-data product database with a
public read API and no key, and it covers the packaged groceries that are the tedious
half of hand entry.

Adding it crosses a line this codebase has never crossed: **there is currently no
outbound HTTP anywhere in `src/`.** No `fetch`, no HTTP client dependency, and exactly
one route handler (NextAuth's). Every read is a `server-only` query module against the
local Postgres; every write is a Server Action. The app is self-hosted on home hardware
behind Tailscale (ADR-0002), so "the network is reachable" is not a given.

Three questions had to be answered together: where the request runs, what happens when
it fails, and where OFF's data model meets ours.

## Decision

**1. The request runs in a Server Action.**

Not a route handler, and not the browser. The reasons, in order of weight:

- It reuses the mechanism the app already has for client→server calls. A route handler
  would be a second, differently-shaped API surface that needs its own auth check.
- The server stays the only thing that talks to the internet. The OFF `User-Agent` and
  rate-limit courtesy live in one place, and the user's browsing isn't sent to a third
  party directly from their device.
- No CORS to reason about, in either direction.

The cost is that an OFF outage manifests as a _slow Server Action_, which blocks the
React transition the calling dialog is in. The UI must therefore always show a pending
state and must never gate the rest of the dialog on the search.

**2. Failure is a value, not an exception.**

`off-client.ts` never throws. It returns a discriminated result carrying a typed failure
(`offline` / `timeout` / `http` / `malformed` / `disabled`), and the UI renders that
message _inside_ the search panel while the hand-entry fields below stay fully usable.
A self-hosted app on home hardware will be offline sometimes; "the food database is
unreachable" must degrade to "type it in yourself", which is exactly the behaviour that
existed before this feature.

Two smaller decisions fall out of this:

- **Timeouts are short and different per call** — 6 s for search, 4 s for a barcode
  lookup, because in the barcode case the user is standing at a shelf holding a phone.
- **`OFF_ENABLED` is a kill switch.** An install with no internet hides the feature
  rather than showing a permanently-failing search box, and `OFF_API_URL` /
  `OFF_SEARCH_URL` give a mirror or a test somewhere else to point.

**2b. Two hosts, because OFF's text search is a different service.**

Worth stating explicitly, because the obvious choice is wrong and fails _silently_:

| Endpoint                                               | Result                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `world.openfoodfacts.org/api/v2/search?search_terms=…` | 200 OK, and **ignores the search terms** — returns all 4.6M products in arbitrary order |
| `world.openfoodfacts.org/cgi/search.pl?…`              | 503                                                                                     |
| `search.openfoodfacts.org/search?q=…`                  | Actually relevant results                                                               |

All three were tried against the live service. The first is the dangerous one: it looks
like it worked. Full-text search therefore goes to `search.openfoodfacts.org`, while
barcode lookups stay on `world.openfoodfacts.org/api/v2/product/{code}.json`.

The two hosts also return **different shapes for the same fields** — `brands` is a
comma-separated string from the product API and an array from the search API — so the
mapper accepts both. Assuming one dropped the brand from every search result.

**3. Searching writes nothing.**

Search and lookup are pure reads that return candidate foods. Only an explicit import
inserts a row. OFF is crowd-sourced and its data is frequently wrong or incomplete, so
the user has to be able to see and edit a product before it enters their library — and
a search that wrote rows would grow the library on every keystroke.

**4. The OFF→food mapping branches on data presence, never on `nutrition_data_per`.**

This is the part most likely to produce quietly wrong numbers, so it is a pure,
unit-tested function (`off-mapping.ts`) with no I/O.

- Prefer the `*_serving` nutriments when the product has a `serving_size` **and** at
  least one serving value; otherwise fall back to `*_100g` with a `"100 g"` label.
- **Never mix the two bases.** A missing serving value becomes 0, _not_ the 100 g
  figure — otherwise a product's protein can end up on a different basis from its
  calories, which is a wrong answer that looks completely reasonable.
- `nutrition_data_per` is ignored, because products routinely declare one basis and
  populate the other.
- **Sodium is stored in mg; OFF publishes it in grams.** Single most likely unit bug in
  the whole feature, and it has its own test.
- Energy prefers `energy-kcal_*` and falls back to converting kJ.

The per-100g case needs **no schema change and no normalisation layer**, which is the
happy accident that makes this cheap: `meal_entries.servings` is already a unitless
multiplier against a free-text `serving_label`, so 250 g of yogurt is `servings: 2.5`
against a `"100 g"` serving, and the existing UI renders "2.5 × 100 g" correctly.

## Consequences

**Good.** The library can be populated in seconds instead of minutes. The mapping is
pure and testable without a network. The failure path is the pre-existing hand-entry
path, so the feature has no ability to make the module worse than it was.

**Bad.** The app container now needs outbound HTTPS, which `docker-compose.prod.yml`
must permit — a new deployment requirement for a system whose whole premise is that it
runs on your own hardware. The tests cannot exercise the live API: Playwright's
`page.route()` cannot intercept it, because the fetch happens on the server rather than
in the browser. Every OFF spec therefore asserts only offline-safe behaviour, and live
checks are one-time manual verifications recorded in the step. **A self-hosted app's
test suite must not require the internet.**

We also inherit OFF's data quality. Product names are user-generated, multilingual and
unbounded, so they are length-capped before render; nutriment values arrive as numbers,
numeric strings, or junk, so every one goes through a single coercion helper that
rejects negatives and absurd magnitudes.

## Alternatives considered

- **A route handler under `/api`.** Rejected: a cacheable GET is a genuine benefit for
  a search endpoint, but it means a second API surface to auth-protect for a feature
  with exactly one caller.
- **Fetching directly from the browser.** Rejected: simplest to write, but it is a
  data-fetching pattern that exists nowhere else here, and it sends the user's queries
  to a third party from their own device rather than via their server.
- **USDA FoodData Central.** Rejected: better data quality for whole foods, but it
  requires an API key, and its coverage of packaged retail products — the ones with
  barcodes, which is the actual pain — is far weaker.
- **Importing an OFF database dump locally.** Rejected as disproportionate: the full
  dump is tens of gigabytes, and keeping it fresh is a scheduled job on a machine that
  deliberately runs no scheduler (ADR-0004).
