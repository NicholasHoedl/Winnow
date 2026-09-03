import { seedUserId, withTestDb } from "./_test-db"

/**
 * Create a task straight in the database, and hand back its id.
 *
 * The mirror of `deleteTasksMatching` below. Same rule from the other end: a task the spec
 * is TESTING the creation of goes through the dialog; a task that only has to exist so
 * something else can be asserted comes from here.
 *
 * **`completedAt` is written whenever `status` is "done", and that is not optional.** The
 * dashboard keeps a task you ticked visible until midnight and decides that from
 * `completed_at`, not from status (`onBoard` in `(app)/_lib/agenda.ts`), so a seeded done
 * task with a null stamp is invisible there — which would look exactly like the feature
 * being broken.
 */
export async function seedTask(fields: {
  title: string
  dueDate?: string | null
  goalId?: string | null
  status?: "open" | "done"
}): Promise<string> {
  const done = fields.status === "done"
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into tasks (user_id, title, due_date, goal_id, status, completed_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        userId,
        fields.title,
        fields.dueDate ?? null,
        fields.goalId ?? null,
        done ? "done" : "open",
        done ? new Date() : null,
      ],
    )
    return rows[0].id
  })
}

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
