import { seedUserId, withTestDb } from "./_test-db"

/**
 * Create a list straight in the database, and hand back its id.
 *
 * The Lists page can make one through the UI, and `manager-renames.spec.ts` proves that;
 * a spec about FILTERING by a list is not about the form that made it, so it seeds one the
 * way `_habits.ts` and `_goals.ts` seed theirs.
 */
export async function seedList(fields: { name: string }): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into lists (user_id, name) values ($1, $2) returning id`,
      [userId, fields.name],
    )
    return rows[0].id
  })
}

/**
 * Remove test lists straight from the database. `tasks.list_id` is `ON DELETE SET NULL`,
 * so a task filed under one is unfiled rather than deleted — which is why a spec deletes
 * its tasks first and its lists last, and why this never leaks a task.
 */
export async function deleteListsMatching(fragment: string): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from lists where strpos(name, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
