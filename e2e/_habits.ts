import { type Locator } from "@playwright/test"

import { seedUserId, withTestDb } from "./_test-db"

/**
 * Create a habit straight in the database, and hand back its id.
 *
 * **The defaults mirror the DIALOG's, not the schema's** — "3 a week", where the column
 * default for `target_count` is 1. That is deliberate: these fixtures replace
 * `addHabit(page, title)`, whose canonical case is three-a-week, and every assertion that
 * reads a meter is written against that number. A helper defaulting to the column would
 * silently retune those without touching them.
 *
 * `unit` + `targetAmount` make the measured variant ("20 words a day"). They were unwritable
 * until T19; they are ordinary columns now.
 */
export async function seedHabit(fields: {
  title: string
  period?: "day" | "week" | "month"
  targetCount?: number
  goalId?: string | null
  unit?: string | null
  targetAmount?: number | null
  startDate?: string
}): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into habits
         (user_id, title, period, target_count, goal_id, unit, target_amount,
          start_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        userId,
        fields.title,
        fields.period ?? "week",
        fields.targetCount ?? 3,
        fields.goalId ?? null,
        fields.unit ?? null,
        fields.targetAmount ?? null,
        // `start_date` is NOT NULL with no default — a habit that failed to say when it
        // began is a bug, the same reasoning `period` carries. Today, which is what the
        // dialog writes for a new habit, so a seeded one has no prior periods to drag a
        // streak down.
        //
        // **en-CA gives YYYY-MM-DD in LOCAL time, and local is the point.** `toISOString`
        // would give the UTC date, which after 18:00 in Chicago is already tomorrow — and a
        // habit that starts tomorrow does not count a session logged today, which would
        // surface as a meter reading zero for a log the test just made.
        fields.startDate ?? new Date().toLocaleDateString("en-CA"),
      ],
    )
    return rows[0].id
  })
}

/**
 * Reading a habit's quota off its meter.
 *
 * Shared because the quota is drawn on three surfaces — the dashboard card, `/activity`'s
 * strip and `/activity/habits` — and two spec files assert on it. One copy means the next
 * change to how a quota is drawn costs one edit here rather than fifteen scattered ones,
 * which is the same reasoning that produced `_goals.ts`.
 *
 * These read `aria-valuetext` rather than visible text because the visible "2/3 this week"
 * is GONE: a quota is drawn as one box per log you owe, and countable boxes make the
 * numbers redundant. That leaves the meter as the only thing carrying the count, so
 * asserting on what it announces tests the number and its accessibility together — a text
 * assertion cannot, because there is no text left to match.
 */

/** The quota meter inside `scope`, named for its habit so a page of many stays unambiguous. */
export function meter(scope: Locator, title: string): Locator {
  return scope.getByRole("progressbar", { name: title })
}

/**
 * "2 of 3 this week", or "12 of 20 words today" — the shape `QuotaMeter` builds for
 * `aria-valuetext`.
 *
 * `unit` is what separates the two kinds of habit in the one string every surface
 * announces. A session habit has none; a measured one names it between the figures and the
 * cadence, which is also the order it reads aloud in.
 */
export function announces(
  done: number,
  target: number,
  period: string,
  unit?: string,
): string {
  return `${done} of ${target}${unit ? ` ${unit}` : ""} ${period}`
}

/**
 * Remove test habits straight from the database — the noun this file was missing.
 *
 * `habits.goal_id` is `ON DELETE SET NULL` (schema.ts: giving up a target must not delete
 * the practice that served it), so deleting a goal does NOT take the habits a plan created
 * with it. `companion.spec.ts` had leaked one per applied plan since T12c, permanently and
 * invisibly — invisibly because the only leaked habit was WEEKLY, and its meter caption
 * reads "this week". The moment the stub proposed a DAILY one the caption became "today",
 * and `todos-sections.spec.ts` — which selects its Today section with
 * `locator("section").filter({ hasText: "Today" })`, case-insensitively — started matching
 * the habit strip as well and failed on strict mode.
 *
 * `strpos` rather than `LIKE`, matching `deleteTasksMatching`: the fragment keeps CONTAINS
 * semantics so no caller has to think about `%` meaning something. Entries cascade with the
 * row.
 */
export async function deleteHabitsMatching(fragment: string): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from habits where strpos(title, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
