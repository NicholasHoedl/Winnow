import { test, expect } from "./_test"

import { goalCard } from "./_card"
import {
  deleteGoalsMatching,
  seedGoal,
  seedMilestone,
  openGoalDetail,
} from "./_goals"
import { deleteHabitsMatching, seedHabit } from "./_habits"
import { withTestDb } from "./_test-db"

/**
 * The goal detail dialog's two editable lists, and what a delete does to them.
 *
 * Four gaps this covers, all reported from real use:
 *   - a milestone could be added and deleted but never EDITED, so a typo cost you the row's
 *     position and whatever `completed_at` it had earned;
 *   - the practice was read-only, so the habits a goal was made of could only be managed
 *     from `/activity/habits` — the round trip the section was added to remove;
 *   - deleting a goal silently detached its habits, with nothing on screen saying so.
 *
 * The delete assertions read the DATABASE rather than another page. What is being tested is
 * which rows survive and in what state, and `archived_at` is not rendered anywhere — the
 * habits page shows archived habits in a separate list, which would make the assertion about
 * that page's grouping rather than about the delete.
 */

const STAMP = Date.now()
const PREFIX = `E2E gpractice ${STAMP}`

/** How a habit stands after the goal that owned it was deleted. */
async function habitState(
  title: string,
): Promise<{ exists: boolean; archived: boolean; goalId: string | null }> {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{
      archived_at: Date | null
      goal_id: string | null
    }>("select archived_at, goal_id from habits where title = $1", [title])
    const row = rows[0]
    return {
      exists: rows.length > 0,
      archived: !!row?.archived_at,
      goalId: row?.goal_id ?? null,
    }
  })
}

test.afterEach(async () => {
  await deleteHabitsMatching(PREFIX)
  await deleteGoalsMatching(PREFIX)
})

test("a milestone can be renamed and redated in place", async ({ page }) => {
  const title = `${PREFIX} edit`
  const goalId = await seedGoal({ title })
  await seedMilestone({
    goalId,
    title: "draft the outlien",
    dueDate: "2026-10-01",
  })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  const detail = page.getByRole("dialog")

  // The title IS the edit affordance — there is no room on the row for a fourth icon
  // button at phone width, which is the constraint the whole dialog is built around.
  await detail.getByRole("button", { name: "Edit draft the outlien" }).click()
  const field = detail.getByLabel("Edit draft the outlien")
  await field.fill("draft the outline")
  await detail.getByLabel("Due date for draft the outlien").fill("2026-11-15")
  await detail.getByRole("button", { name: "Save" }).click()

  await expect(detail).toContainText("draft the outline")
  await expect(detail).toContainText("Nov 15, 2026")
  // The row is still one row: an edit must not become an add.
  await expect(detail.getByText("draft the outlien")).toHaveCount(0)
})

test("escape abandons a milestone edit without writing", async ({ page }) => {
  const title = `${PREFIX} escape`
  const goalId = await seedGoal({ title })
  await seedMilestone({ goalId, title: "keep me exactly" })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  const detail = page.getByRole("dialog")

  await detail.getByRole("button", { name: "Edit keep me exactly" }).click()
  await detail.getByLabel("Edit keep me exactly").fill("clobbered")
  await detail.getByLabel("Edit keep me exactly").press("Escape")

  await expect(detail).toContainText("keep me exactly")
  await expect(detail.getByText("clobbered")).toHaveCount(0)
})

test("a practice can be added to a goal from its own dialog", async ({
  page,
}) => {
  const title = `${PREFIX} add practice`
  await seedGoal({ title })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  // Addressed BY NAME, both of them. Two dialogs are open at once in the middle of this
  // test, and a bare `getByRole("dialog")` silently re-resolves to whichever is on top —
  // which made this assert against the habit form's own copy of the goal title.
  const detail = page.getByRole("dialog", { name: title })
  await expect(detail).toContainText("None yet. A practice is something you")

  await detail.getByRole("button", { name: "Add a practice" }).click()
  // The habit dialog opens on top, already pointed at this goal — picking the goal you are
  // standing inside is exactly the step this button exists to skip.
  const habitDialog = page.getByRole("dialog", { name: "New habit" })
  await habitDialog
    .getByLabel("Title", { exact: true })
    .fill(`${PREFIX} swim laps`)
  await habitDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(habitDialog).toHaveCount(0)

  // The goal's dialog is still open underneath — it is not dismissed by the habit dialog,
  // and the new practice appears in it once the write revalidates. Reopening it would need
  // the card, which is behind the overlay.
  await expect(detail).toContainText(`${PREFIX} swim laps`)

  const state = await habitState(`${PREFIX} swim laps`)
  expect(state.exists).toBe(true)
  expect(state.goalId).not.toBeNull()
})

test("deleting a goal leaves its practice alone by default", async ({
  page,
}) => {
  const title = `${PREFIX} leave`
  const habit = `${PREFIX} leave habit`
  const goalId = await seedGoal({ title })
  await seedHabit({ title: habit, goalId })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  // No radio touched: "Leave them" is preselected, which is what deleting a goal has
  // always done. A confirm dialog is the wrong place to change what Enter does.
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)

  const state = await habitState(habit)
  expect(state.exists).toBe(true)
  expect(state.archived).toBe(false)
  // Detached, not deleted — `habits.goal_id` is ON DELETE SET NULL.
  expect(state.goalId).toBeNull()
})

test("deleting a goal can archive its practice instead", async ({ page }) => {
  const title = `${PREFIX} archive`
  const habit = `${PREFIX} archive habit`
  const goalId = await seedGoal({ title })
  await seedHabit({ title: habit, goalId })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("radio", { name: /Archive them/ }).check()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)

  const state = await habitState(habit)
  expect(state.exists).toBe(true)
  expect(state.archived).toBe(true)
})

test("deleting a goal can delete its practice too", async ({ page }) => {
  const title = `${PREFIX} purge`
  const habit = `${PREFIX} purge habit`
  const goalId = await seedGoal({ title })
  await seedHabit({ title: habit, goalId })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("radio", { name: /Delete them/ }).check()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)

  const state = await habitState(habit)
  expect(state.exists).toBe(false)
})

test("a goal with no practice is not asked about one", async ({ page }) => {
  const title = `${PREFIX} bare`
  await seedGoal({ title })

  await page.goto("/goals")
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()

  // The choice only exists because habits CAN outlive a goal. With none attached there is
  // nothing to decide, and a radio group about nothing is a question with no answer.
  await expect(page.getByRole("radio")).toHaveCount(0)
  await expect(page.getByRole("alertdialog")).toContainText(
    "will be permanently deleted",
  )
})
