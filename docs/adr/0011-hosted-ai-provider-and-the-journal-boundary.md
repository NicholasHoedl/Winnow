# ADR-0011: The AI Companion Calls A Hosted API, And The Journal Never Leaves

**Status:** Accepted (pre-implementation)
**Date:** 2026-08-04
**Supersedes:** the local-model decision recorded in `docs/HANDOFF.md` §5 before this date.

## Context

The planned AI companion proposes structured work the user approves — decomposing a goal
into milestones and tasks, and analysing a week. It is scoped but not built.

The provider decision was originally **local model**, argued from two things. One of them
was wrong and the other was imprecise.

**Wrong:** the host was believed to have a discrete NVIDIA GPU with 12GB+ VRAM, which makes
a 14B-class model comfortable. It has **6GB**. After display overhead that is ~5–5.5GB
usable, which caps a fully-offloaded model at 7–8B quantised to 4 bits (~4.1–4.9GB of
weights, leaving roughly 1GB of KV cache — about 4–8K of context). A 12–14B model does not
fit; partial CPU offload drops it to ~3–6 tok/s.

**Imprecise:** the argument leaned on ADR-0002's "no public internet exposure at any
point". That ADR governs **ingress** — nothing reaches the app except across the tailnet —
and it does not forbid outbound calls. ADR-0005 already established one. The real question
was never network topology; it is **what content leaves the machine**, and that varies
enormously by feature. Open Food Facts sends a barcode. A journal retrospective would send
the most private text in the app.

One further thing changed the analysis. Schema adherence is **not** a model-size problem.
With constrained decoding (llama.cpp GBNF grammars, Ollama structured outputs) the sampler
is restricted at each step to tokens that keep the output valid, so malformed JSON is
structurally impossible to emit — a 3B model cannot produce it. The failure mode a small
local model was feared for is solvable at the sampler.

What 6GB actually costs is **judgment**: whether the milestones are sensible, whether the
dates are realistic, whether a weekly review says something true rather than generic. That
is the entire reason the feature exists, and it is the one thing constrained decoding
cannot supply.

## Decision

**1. The companion calls a hosted API**, behind the OpenAI-compatible seam already planned
(originally `AI_ENABLED` / `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` in `src/lib/config.ts`,
shaped exactly like the `OFF_*` keys — **moved into the Settings page in T11**, see the
final amendment).

The seam is kept precisely *because* the provider is now remote: it leaves a local endpoint
one env var away, which is what the next decision depends on.

> **Amended 2026-08-06.** The seam now carries **two** protocols — `openai` by default, or
> `anthropic` — selected by a provider setting (`AI_PROVIDER` at the time, a Settings field
> from T11 below). The user's key is Anthropic's, and that API is not an OpenAI dialect: different path, `x-api-key` instead of a bearer token, a
> required version header, `system` hoisted out of the message list, a required
> `max_tokens`, and structured output via forced tool-use rather than `response_format`.
>
> The Anthropic path is the **stronger** of the two on the one thing this feature depends
> on. `response_format` is a request a provider may ignore — which is why the OpenAI path
> is documented as degrading to `malformed` — whereas `tool_choice` naming a tool forces
> the call, and the payload arrives already parsed rather than as text that might have
> prose around it. Both still pass through the same Zod parse, so the schema is enforced on
> our side either way.

**2. Journal and note content never leaves the machine.** Not "avoid where practical" — it
is never included in any payload sent to a hosted provider, by any feature, ever.

Journal-aware retrospectives — noticing that you have written about being tired on six of
the last eight Mondays — were identified as the single capability a database genuinely
cannot provide. They are **deferred, not cancelled**: they are the one feature that
justifies standing up a local model later, on hardware that can hold one.

**3. Propose-only and task-shaped stand unchanged.** The model never writes to the
database; it emits a proposal validated by the module's existing Zod schemas, which the
user edits and approves. Entry points are specific actions with known schemas, not a chat.

## Consequences

**The boundary has to be enforced, not intended.** A rule this easy to violate by accident
needs something that fails when it is broken. Two requirements on the implementation:

- Prompt payloads are **constructed explicitly** from named fields, never spread from raw
  module rows. A `...row` in a prompt builder is how the journal ends up on the wire.
- The notes module must be unreachable from the prompt-building path, and a test should
  assert it — the same shape of guarantee as `account/coverage.test.ts`, which fails loudly
  when a module goes unwired.

**The weekly review already complies, by accident.** `getWeeklyReview` composes tasks,
milestones, meals and money, and touches neither `notes` nor the journal. That is currently
a coincidence of what T7d needed; this ADR makes it a constraint, so anyone adding journal
content to the review has to come here first.

**Feature privacy is now graded, and the first slice is the least sensitive.** Goal planning
sends a title and its milestones — "Learn 2000 Kanji" is not a secret. The weekly review
sends rollups, not rows. That grading is what makes a hosted provider acceptable for the
work actually planned.

**A new secret enters the deploy.** `AI_API_KEY` joins `POSTGRES_PASSWORD`, `AUTH_SECRET`
and `SEED_USER_PASSWORD` as a value the user types and no agent handles. It is deliberately
**not** added to `.env.example` until the feature exists — a key with no reader is the same
anti-pattern as a column with no writer.

**The kill switch matters more than it did.** `AI_ENABLED=false` must hide every AI
affordance and leave the app exactly as it is today, and a provider outage must surface as a
typed failure inside the panel — `offline` / `timeout` / `http` / `disabled` — with the
manual path still fully usable. That is ADR-0005's failure-as-value pattern, and the
argument for it is stronger here: OFF is a convenience, and an outage during goal planning
interrupts something the user sat down to do.

**Cost is not a factor at this volume**, and should not become an argument for degrading
the feature. Occasional planning plus a weekly review is a rounding error.

**Reversible.** Everything above is a config change plus a local endpoint. That is the
whole point of keeping the seam.


---

## Amended 2026-08-07 (T11): configured in the app, not the environment

The five `AI_*` env vars are **gone**. Provider, base URL, model and API key live in
`user_preferences` and are edited on the Settings page; `src/lib/config.ts` holds nothing
about AI. `getAiSettings` / `getAiConfig` read them per request and `aiReady` decides
whether the feature is usable.

Removed rather than kept as a fallback: two sources for one setting needs a precedence rule,
and a precedence rule produces a settings page that sometimes silently does nothing.

**The opt-in property is unchanged.** The columns default to off with empty strings, so a
fresh install and a restored backup both have no companion until someone fills the form in —
the same guarantee `AI_ENABLED=false` used to give.

Three consequences, each a place this could go wrong later:

1. **The key must never reach the browser.** `preferencesFor` lists its fields by name and
   must never spread the row — that list is the only thing between a new column and the
   client-side `PreferencesProvider`. The key is fetched by a separate `getAiConfig`, whose
   only caller should stay `ai-client.ts`, and the settings page gets a masked hint
   (`••••4f2a`) rather than the value. `e2e/ai-settings.spec.ts` asserts the key is absent
   from the whole rendered document, RSC payload included.
2. **The key is excluded from the account export in BOTH directions.** The exporter blanks
   it, so a backup file cannot spend money; and `importUserData` carries the existing key
   across the wipe, because a backup that cannot contain your key must not be able to delete
   it either.
3. **The e2e suite no longer takes its provider from `.env`.** `e2e/ai.setup.ts` writes the
   stub's details through the real settings form before any spec runs, which has the side
   benefit of exercising that path on every run.

Deliberately **not** encrypted at rest. On a single-user self-hosted box, whoever can read
this row can generally read the machine, and encrypting with `AUTH_SECRET` would add a
rotation failure mode surfacing as a puzzling 401 from the provider. The calendar feed token
sets the same precedent.

---

## Amended 2026-08-14 (T13): the journal is gone, the rule that guarded it is not

The notes/journal module was **removed entirely** — UI, module, and the table, dropped in
migration `0035`. Decision §2 above therefore has no subject left: there is no journal
content on this machine for a payload to leak.

**§2 is not thereby satisfied — it is vacated.** A rule whose subject no longer exists has
not been honoured, it has stopped being testable, and the difference matters because the
*enforcement* half of it was never really about the journal. Restated so it survives its
subject:

> **Prompt payloads are constructed explicitly from named fields, never spread from raw
> module rows.** No `...row` in a prompt builder, for any module, whether or not the module
> holding the sensitive column exists today.

That is the durable rule, and it is the one the Consequences section already gave first.
It generalises without loss: `tasks.notes`, `goals.notes`, `events.notes` and a routine
item's notes are all free-text columns the user may treat exactly as they treated the
journal, and every one of them is reachable from a module the companion *does* read. The
boundary moved from "one module is off-limits" to "every builder names its fields", which
is the stronger of the two and always was — the module-level ban was only ever a coarse
belt over that brace.

**What is genuinely lost:** the second enforcement bullet, "the notes module must be
unreachable from the prompt-building path, and a test should assert it". No such test was
ever written, and now none can be. `account/coverage.test.ts` remains the model for the
shape it should have taken.

**The title and the filename still say "journal", and are left that way on purpose.** Not
because anything would break — every reference in HANDOFF and IMPROVEMENT-PLAN is to
"ADR-0011" by number, and none names the file — but because an ADR records what was decided
when it was decided. A record retitled to match what the codebase later became is no longer
a record. Read the title as historical and this amendment as the current rule.

**Journal-aware retrospectives are cancelled, not deferred.** §2 called them "the one
feature that justifies standing up a local model later". With the module removed there is
no corpus to retrospect over, so the local-model argument loses its strongest single
motivation. Anyone reviving journaling should read this ADR from the top: the reasoning
about *graded feature privacy* is what would apply to it, and it would arrive into an app
whose prompt builders are field-named rather than module-fenced.

**The five code comments that named the boundary** — two in `companion/queries.ts`, two in
`companion/service.ts`, one in `companion/service.test.ts` — were reworded to state the
field-naming rule instead of pointing at a module that is no longer there. The test at
`service.test.ts` asserting the goal prompt as an exact string is now the **only mechanical
enforcement this ADR has**, which is worth knowing before anyone loosens it for being
brittle. Brittle is the feature.
