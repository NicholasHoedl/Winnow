import { seedUserId, withTestDb } from "./_test-db"

/**
 * Plant weigh-ins straight in the database — `body_weights` is one row per day, so a
 * second call for the same date is a correction, exactly as the card's Save is.
 *
 * The same rule `_tasks.ts` states: a weigh-in a spec is TESTING the saving of goes
 * through the card; one that only has to exist so the dashboard has something to read
 * comes from here.
 */
export async function seedWeights(
  rows: { date: string; weightLb: number }[],
): Promise<void> {
  await withTestDb(async (client) => {
    const userId = await seedUserId(client)
    for (const row of rows) {
      await client.query(
        `insert into body_weights (user_id, date, weight_lb)
         values ($1, $2, $3)
         on conflict (user_id, date) do update set weight_lb = excluded.weight_lb`,
        [userId, row.date, row.weightLb],
      )
    }
  })
}

/** Remove the weigh-ins on exactly these dates. */
export async function deleteWeightsOn(dates: string[]): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from body_weights where date = any($1::date[])",
      [dates],
    )
    return rowCount ?? 0
  })
}
