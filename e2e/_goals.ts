import { expect, type Page } from "@playwright/test"

import { goalCard } from "./_card"
import { seedUserId, withTestDb } from "./_test-db"

/**
 * Create a goal straight in the database, and hand back its id.
 *
 * The mirror of `deleteGoalsMatching` below, and it follows the same rule from the other
 * end: **a goal that IS the thing under test is made through the dialog; a goal that is
 * merely a precondition is made here.** `addGoal` stays for the specs that mean to exercise
 * the form — `goals-order`, `goals-progress`, `review` and `task-links` all still do.
 *
 * The saving is not the insert against the dialog, it is the NAVIGATION around it: every
 * dialog-driven fixture costs a `goto` to the page that owns the button, and the page it
 * lands on is rarely the page the assertions are about.
 */
export async function seedGoal(fields: {
  title: string
  targetDate?: string | null
  notes?: string | null
  /**
   * When the goal was made. Defaults to now, which is what a goal created through the
   * dialog gets — and which puts it inside `MOMENTUM_GRACE_DAYS`, so it reads as NEITHER
   * moving nor stalled. A spec asserting "Stalled" has to seed a goal old enough to be
   * judged; `goal-momentum.spec.ts` is where that matters and says so.
   */
  createdAt?: Date
}): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into goals (user_id, title, target_date, notes, created_at)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        userId,
        fields.title,
        fields.targetDate ?? null,
        fields.notes ?? null,
        fields.createdAt ?? new Date(),
      ],
    )
    return rows[0].id
  })
}

/**
 * Attach a milestone straight to a goal, and hand back its id.
 *
 * Same rule as `seedGoal` above: a milestone that IS the thing under test is made through
 * the dialog's add row; a milestone that is merely a precondition is made here. A spec
 * needing five of them to fill a dialog pays five `fill`/`click` round trips otherwise, and
 * none of them is what it is asserting about.
 */
export async function seedMilestone(fields: {
  goalId: string
  title: string
  dueDate?: string | null
  done?: boolean
  sortOrder?: number
}): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into milestones (user_id, goal_id, title, due_date, done, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        userId,
        fields.goalId,
        fields.title,
        fields.dueDate ?? null,
        fields.done ?? false,
        fields.sortOrder ?? 0,
      ],
    )
    return rows[0].id
  })
}

/**
 * Creating, opening and deleting a goal on `/goals`.
 *
 * Shared because T10 moved all three, and T13 moved them again — which is the point. Six
 * specs were carrying six copies of "open the dropdown, click Delete, confirm"; one copy
 * meant the move from the rail to a page cost one edit here instead of six there.
 *
 * None of these navigate — callers are already on `/goals`, and hiding a `goto` inside a
 * helper is how a spec ends up asserting against a page it did not mean to be on.
 */

/** Create a goal through the dialog; every field is optional except the title. */
export async function addGoal(
  page: Page,
  fields: {
    title: string
    current?: string
    target?: string
    unit?: string
    targetDate?: string
  },
) {
  // One label at last. The rail had two affordances that changed with the account's state
  // — "Add a goal" at zero, a `+` icon labelled "Add goal" thereafter — and matching only
  // the second meant this helper silently required a goal to already exist, which is
  // exactly what broke when T12g gave the suite an empty database. `/goals` has one header
  // button at every state.
  await page.getByRole("button", { name: "New goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(fields.title)
  if (fields.current) await dialog.getByLabel("Current").fill(fields.current)
  if (fields.target)
    await dialog.getByLabel("Target", { exact: true }).fill(fields.target)
  if (fields.unit) await dialog.getByLabel("Unit").fill(fields.unit)
  if (fields.targetDate) {
    await dialog.getByLabel("Target date (optional)").fill(fields.targetDate)
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  // `goalCard` at every width now. It used to be `goalEntry`, which matched the rail card
  // OR the mobile chip, because the rail was `lg:` only and a goal had two presentations.
  // `/goals` renders one card at every width, so the two-presentation problem is gone.
  await expect(goalCard(page, fields.title)).toHaveCount(1)
}

/** Open one goal's detail dialog — milestones, progress wording, edit and delete. */
export async function openGoalDetail(page: Page, title: string) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

/** Delete a goal by title, through its detail dialog and the confirm. */
export async function deleteGoal(page: Page, title: string) {
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)
}

/**
 * Delete every goal whose title contains `fragment`, straight from the database.
 *
 * **Takes no `page`, and that is the point.** This used to walk `/goals`, opening each
 * card's detail dialog and confirming, which made it silently vacuous anywhere else:
 * `goalCard` matched nothing, the loop broke on its first iteration, and `toHaveCount(0)`
 * passed because zero really was what was on the page. A cleanup that deletes nothing and
 * reports success is worse than one that throws — it leaks a row into every spec that
 * follows.
 *
 * That was not hypothetical. T13 moved goal cards from `/activity` to `/goals`;
 * `review.spec.ts` kept cleaning up on `/activity`, leaked a goal for a whole run, and the
 * only thing that noticed was a 4px layout overflow on `/companion`, whose goal picker
 * defaults to the oldest surviving goal. The fix at the time was a guard asserting the
 * "New goal" button was visible before concluding there was nothing to delete. Needing no
 * page at all is the better answer: there is no wrong page to be on.
 *
 * `strpos` rather than `LIKE`, so the fragment keeps the CONTAINS semantics `hasText` gave
 * it and no caller has to think about `%` or `_` meaning something. Deleting a goal takes
 * its milestones with it and detaches linked tasks and habits — `on delete cascade` and
 * `on delete set null` respectively — exactly as deleting one through the UI does.
 */
export async function deleteGoalsMatching(fragment: string): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from goals where strpos(title, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
