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
 * Matches on **payee**, which is the field the layout fixtures label themselves with. A
 * transaction is a leaf — nothing references one — so there is nothing to detach first.
 */
export async function deleteTransactionsMatching(
  fragment: string,
): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from transactions where strpos(payee, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
