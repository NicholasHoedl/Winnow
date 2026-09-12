import { withTestDb } from "./_test-db"

/**
 * Remove test transactions straight from the database.
 *
 * The fourth noun in the fixture-teardown pattern, after events, goals and tasks. It was
 * missed by that sweep because the only transaction fixture at the time lived inside
 * `mobile-layout.spec.ts`, which tore down by driving the row menu — and a UI teardown was
 * survivable there while exactly one spec needed it. Two specs now do.
 *
 * `strpos` rather than `LIKE`, matching `deleteGoalsMatching` and `deleteTasksMatching`: the
 * fragment keeps the CONTAINS semantics `visibleCard(page, fragment)` gave it, so no caller
 * has to think about `%` or `_` meaning something.
 *
 * Matches on **payee, falling back to description** — the same field, and the same order,
 * the payee memory itself reads (`getPayeeMemory`). It matched on payee alone, and the
 * budget quick-add bar writes NO payee: what is left of the line after the amount becomes
 * the description. So a spec cleaning up rows that bar had created deleted nothing and
 * said so with a 0 nobody was reading — the rows stayed in the month, inflating the totals
 * the budget specs assert on, and the failure would land on some later spec instead.
 *
 * A transaction is a leaf — nothing references one — so there is nothing to detach first.
 */
export async function deleteTransactionsMatching(
  fragment: string,
): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      // `nullif(payee, '')` because the column is not null on every row that has no payee
      // — an empty string is what a form submits — and `coalesce` would take it.
      "delete from transactions where strpos(coalesce(nullif(payee, ''), description, ''), $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
