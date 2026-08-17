import { withTestDb } from "./_test-db"

/**
 * Remove test tasks straight from the database.
 *
 * The last noun in the fixture-teardown pattern, after events and goals — and the one whose
 * UI version was the most dangerous. It looped `for (;;)` rather than counting to a bound,
 * so a delete that did not take spun until the whole test timed out. The bounded loops
 * elsewhere at least failed with something to read.
 *
 * `strpos` rather than `LIKE`, matching `deleteGoalsMatching`: the fragment keeps the
 * CONTAINS semantics that `visibleCard(page, fragment)` gave it, so no caller has to think
 * about `%` or `_` meaning something.
 *
 * Deleting a task takes its subtasks with it (`on delete cascade`), exactly as deleting one
 * through the row menu does. A task is on the other side of the goal and event links — those
 * columns are `set null` on it, and nothing points at a task except its own subtasks — so
 * there is nothing else to detach.
 */
export async function deleteTasksMatching(fragment: string): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from tasks where strpos(title, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
