# ADR-0004: Materialize Recurring Transactions On Read

- Status: Accepted
- Date: 2026-07-25

## Context

Recurring bills and income (rent, subscriptions, salary) need to become real
transaction rows so that every existing rollup — the month summary, the
per-category bars, the trend charts, the dashboard cards — works unchanged.

Two engines already exist in the codebase and they take opposite approaches:

- **Recurring tasks** materialize write-time. `ensureRecurringTasks` runs at the
  top of `getTasks()` on every read, keeps exactly one open instance per rule,
  and **hard-deletes** any off-cycle open instance.
- **Recurring calendar events** never materialize. `expandOccurrences` expands a
  series on read and an `event_exceptions` overlay carries per-occurrence edits.

Neither transfers cleanly. Read-time expansion would force every money rollup to
learn about rows that don't exist. The task generator's delete step is actively
dangerous for money: it is an unconditional destructive write executed during a
GET, and a posted transaction is a fact, not a regenerable to-do.

There is also no scheduler in this deployment — no cron container, no queue,
no background worker. Adding one to a single-user self-hosted app is
disproportionate.

## Decision

Materialize recurring transactions into `transactions` as real rows, lazily on
read, with these rules:

1. **Insert-only.** The generator never deletes or rewrites a transaction. There
   is no equivalent of the task generator's delete step.
2. **A high-water mark**, `transaction_recurrences.posted_through`. Catch-up
   covers `(posted_through, today]`, so it is monotonic: deleting a posted
   transaction never resurrects it, which makes "skip this month's bill" just
   the existing delete (with its existing undo) rather than a new concept.
3. **Every missed occurrence posts, not just the current one.** Three unopened
   months of rent are three bills. This is why `cyclesInRange` exists alongside
   `currentCycle`.
4. **Insert first, advance the mark second**, inside one transaction with the
   rule row locked `FOR UPDATE`. This is at-least-once, and the unique
   `(series_id, occurrence_date)` index makes a retry a no-op. The reverse order
   would be at-most-once: a crash between the two steps would silently skip a
   payment, which is the failure that actually loses money.
5. **Edits apply forward only**, and a schedule change additionally skips to the
   end of the current period. Rewriting a posted amount would be falsifying a
   ledger; without the period guard, moving a monthly bill from the 1st to the
   15th on the 10th would post it twice that month.
6. **Catch-up is clamped** to 400 days, and creating a rule whose start date
   would post more than 60 rows is rejected with a message rather than silently
   filling the ledger.

## Consequences

**Good.** Every rollup, chart and dashboard card works with zero changes,
because a posted bill is an ordinary transaction. No new infrastructure. Failure
is swallowed and retried on the next read, so a bad rule degrades to "no new
rows" instead of breaking the budget page.

**Bad.** The materializer performs writes during a GET render. This is already
the pattern used by `ensureRecurringTasks` and `ensureDefaultCalendars`, and it
is legal today because every page in the app is dynamic (`auth()` reads cookies;
there is no `export const dynamic`, no `revalidate`, and neither PPR nor
`cacheComponents` is enabled in `next.config.ts`).

**This is the constraint to remember:** enabling `cacheComponents` — or making
any budget route static — would make writing during render illegal, and the
materializer would have to move to a route handler hit by a scheduler, or to a
server action invoked from the client. `ARCHITECTURE.md` §recurrence still says
occurrences are "computed on the fly, not pre-materialized"; that remains true
of calendar events and is now false of transactions and tasks.

The generator also must never call `revalidatePath` — it throws during render.

## Alternatives considered

- **Read-time expansion (the calendar approach).** Rejected: every rollup,
  filter, sort and chart would need to merge virtual rows, and the moment a user
  edits one occurrence you need the exceptions overlay too.
- **A "scheduled" status the user confirms.** Rejected for now: it keeps the
  ledger honest about what was actually paid, but every rollup then has to decide
  whether scheduled money counts. Revisit if auto-posting proves wrong in use.
- **A cron container.** Rejected as disproportionate for a single-user
  self-hosted app, and it would still need the same idempotency guarantees.
