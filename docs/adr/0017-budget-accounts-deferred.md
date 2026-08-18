# ADR-0017: Budget Accounts Are Deferred, And Said So Out Loud

**Status:** Accepted
**Date:** 2026-08-17

## Context

`SPEC.md` §7.3 specifies the budgeting module as **accounts, categories, transactions,
budgets** — accounts carrying a name, a type (checking/savings/credit/cash/other) and a
starting balance, with every transaction pointing at one.

Three of the four shipped. There is no `accounts` table, `transactions` has no account
column, and nothing anywhere records that this was decided. It is not in SPEC's own §6
out-of-scope list, there is no ADR, and `docs/IMPROVEMENT-PLAN.md` never mentions it across
eighteen tranches. It simply stopped being talked about, some time before T3.

A pre-deploy audit surfaced it as the largest functional gap in the app: the module can
answer _"did I stay under my grocery budget"_ and cannot answer _"how much money do I
have."_ That second question is the one most people open a budget app for.

## Decision

**Accounts stay out**, and this ADR exists so that is a decision rather than a silence.

The reason is not effort. It is that an account balance in _this_ app would be a number that
decays.

Winnow has no transaction import and no bank sync. SPEC §6 puts both out of scope, ADR-0005
narrowed outbound HTTP to a single read-only nutrition lookup, and nothing since has
reversed either. So a balance here would be **manually maintained**: you would type a
starting figure, and it would drift from reality the first time you bought a coffee and did
not log it.

That is worse than having no balance at all, because it looks authoritative while being
wrong. The categories-and-budgets model has no equivalent failure — spent-vs-budgeted is
computed from the transactions you actually entered, so forgetting entries makes it
**under-report**, which is visibly incomplete rather than confidently false.

The second reason is timing. This app has never been used for a single real day (see
`docs/HANDOFF.md` §1). Building a module on the theory that it will be wanted, before the
budget page has been opened for one real month, is speculation — and a new module here is
roughly 23 touch points, including `account/tables.ts`, `clear.ts`, the `search/queries.ts`
fan-out, a `coverage.test.ts` that goes red the moment a new `schema.ts` appears on disk,
and a `tables.test.ts` that pins an exact table count.

## Consequences

- The budget module remains a **spending** tool, not a **net-worth** tool. It answers where
  money went against what you planned, and does not claim to know what you hold.
- `SPEC.md` §7.3 now overstates what exists. It is already marked historical and
  preserved-as-written, so it is not edited to match — this ADR is the correction, the same
  way ADR-0013 is the correction to §7's module layout.
- Anyone reading the schema and noticing the gap gets an answer here instead of re-deriving
  one. That is most of the value of writing this down.

## What would reverse it

Either of these, and the first is likelier:

- **Real daily use showing you reach for a balance.** The §10 soak week is the test. If the
  question _"what's actually in the account"_ comes up and the app cannot answer it, that is
  evidence rather than speculation, and this decision should fall.
- **Transaction import coming into scope.** The objection above is entirely about manual
  maintenance. An importer removes it: a balance derived from imported transactions
  reconciles instead of drifting. Note this would also reverse a SPEC §6 exclusion and
  widen ADR-0005's outbound-HTTP boundary, so it is a larger conversation than it sounds.

## Alternatives Considered

- **Build it as specified.** Rejected for the drift argument above, not for cost.
- **A single "current balance" figure with no account table.** Rejected as the worst of
  both: the same decay, without even the structure to reconcile against later.
- **Leave it undocumented.** This is the status quo, and it is the option this ADR exists to
  close. Unbuilt-and-unexplained means every future reader re-asks the same question and
  gets no answer from the repo.
