import { test, expect, type Page } from "./_test"

import { goalCard, visibleCard } from "./_card"
import { deleteGoalsMatching, seedGoal } from "./_goals"
import { deleteHabitsMatching, seedHabit } from "./_habits"
import { deleteTasksMatching, seedTask } from "./_tasks"

/**
 * Browser coverage for goal momentum: the reading that says whether a goal is still being
 * WORKED, as distinct from how far along it is.
 *
 * The distinction is the whole feature. `goalProgress` reports milestones-done-over-total,
 * so a goal you abandoned last month and one you touched this morning look identical. The
 * assertions below are all about that gap: a goal with untouched work reads stalled, and
 * finishing one linked task flips it — with the progress bar unchanged either way.
 *
 * Default window is 14 days (`goalMomentumDays`), which is what the copy asserts.
 *
 * T10 split where that reading is shown. The rail says only "Stalled", because a 280px
 * column cannot spare a sentence for every goal that is fine; the sentence with the window
 * in it lives in the detail dialog, which is where you go when the badge makes you ask why.
 */

/**
 * Every fixture below is seeded, and every stray is swept, in SQL.
 *
 * What this file TESTS is the momentum reading — stalled versus moving, and the window the
 * copy names. A goal, a linked task and a habit are the preconditions for reading it, and
 * building each through its dialog cost a navigation to the page that owns the button plus
 * a form, none of it on the page the assertion lands on. The dialogs keep their coverage
 * elsewhere: `goals-order`, `goals-progress`, `review` and `task-links` create goals through
 * the form, `activity` and `command-palette` create habits through it.
 *
 * What stays in the browser is everything the reading depends on: ticking the task off,
 * logging the habit from the strip, and changing the window in Settings.
 */
const SWEEP = ["E2E momentum", "E2E untracked", "E2E window"]

/**
 * Older than `MOMENTUM_GRACE_DAYS`, so these goals can be judged at all.
 *
 * A goal is left alone for its first week — it is new, not neglected — so a goal seeded at
 * `now()` reads as NEITHER moving nor stalled and every assertion below about a badge would
 * be asserting against silence. Ten days is comfortably clear of the boundary; the boundary
 * itself is pinned in `goals/service.test.ts`, where it costs milliseconds rather than a
 * page load.
 */
const OLD_ENOUGH = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)

test.afterEach(async () => {
  for (const fragment of SWEEP) {
    // Tasks and habits before goals only for tidiness; each matches on its own title, so
    // unlike the UI version there is no detach-then-orphan ordering to get wrong.
    await deleteTasksMatching(fragment)
    await deleteHabitsMatching(fragment)
    await deleteGoalsMatching(fragment)
  }
})

async function openDetail(page: Page, title: string) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

test("finishing a linked task moves a stalled goal", async ({ page }) => {
  const stamp = Date.now()
  const goalTitle = `E2E momentum ${stamp}`
  const taskTitle = `E2E momentum task ${stamp}`

  const goalId = await seedGoal({ title: goalTitle, createdAt: OLD_ENOUGH })
  await seedTask({ title: taskTitle, goalId })

  await page.goto("/goals")
  const card = goalCard(page, goalTitle)

  // A brand-new goal with one open task has something to track and nothing finished.
  await expect(card.getByText("Stalled")).toBeVisible()
  await expect(card.getByText("1 open")).toBeVisible()

  // The window and the count are in the detail, not on the card.
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/Nothing finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // Tick it off in the task list. Before T10 this was a special "next action" checkbox
  // inside the goal card, because the goals page had no task list of its own; T10 made the
  // compromise unnecessary by putting goals beside the list, and T13 separates them again
  // WITHOUT reviving it — the card links to the filtered list instead of copying it. This
  // click is that link, so it navigates rather than filtering in place.
  await card.getByRole("link", { name: `Show tasks for ${goalTitle}` }).click()
  await expect(page).toHaveURL(/\/activity\?goal=/)
  await visibleCard(page, taskTitle).getByLabel("Mark as done").click()

  await page.goto("/goals")
  await expect(card.getByText("Moving")).toBeVisible()
  await expect(card.getByText("No open tasks")).toBeVisible()
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/1 finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // The work also lands in the week's review, in the Goals card rather than only in Tasks.
  await page.goto("/review")
  await expect(page.getByText(`${taskTitle} · ${goalTitle}`)).toBeVisible()
})

/**
 * T12b. The defect the whole T12 line exists to fix.
 *
 * A habit creates no tasks and ticks no milestones, so before this a goal worked entirely
 * through one had nothing momentum could see: it returned null and the card said nothing, or
 * — once the goal had any other stale work — it read Stalled while being worked hard.
 */
test("a goal worked through a habit reads as moving, not stalled", async ({
  page,
}) => {
  const stamp = Date.now()
  const goalTitle = `E2E momentum habit ${stamp}`
  const habitTitle = `E2E momentum practice ${stamp}`

  const goalId = await seedGoal({ title: goalTitle, createdAt: OLD_ENOUGH })
  // Three-a-week, matching what the dialog's defaults produced — the caption the strip
  // shows ("this week") is read further down, so the cadence is load-bearing here.
  await seedHabit({ title: habitTitle, goalId })

  // Attached but never logged. "Stalled" is the honest reading here — the goal is now
  // measurable, and nothing has been done. Before T12b it was not measurable at all.
  await page.goto("/goals")
  const card = goalCard(page, goalTitle)
  await expect(card.getByText("Stalled")).toBeVisible()

  // One session flips it, logged from the strip rather than through a task. The strip is
  // on `/activity`, which is where practice is logged — the goal card only reads it.
  await page.goto("/activity")
  await page
    .getByTestId("habit-chip")
    .filter({ hasText: habitTitle })
    .getByRole("button", { name: `Log ${habitTitle}` })
    .click()

  // Load-bearing, and its absence was a flake in two consecutive runs. `.click()` waits for
  // the click to DISPATCH, not for the Server Action behind it — and the assertion below is
  // now on a different page, so navigating straight after the click races `logEntry` and
  // reads a goal whose session has not been written yet. This assertion never needed it
  // before T13: the goal card used to be on `/activity` too, so `revalidatePath` re-rendered
  // it underneath a polling assertion and there was nothing to outrun.
  //
  // The toast is the honest signal, for the same reason `expect(dialog).toBeHidden()` is
  // elsewhere in this suite: `useLogHabit` raises it inside the transition, only after
  // `logEntry` has resolved `ok`.
  await expect(page.getByText(`Logged ${habitTitle}`)).toBeVisible()

  // Back to the card to read it. `Moving` as TEXT, not an aria-label on an icon: the rail
  // compressed the healthy case to a bare `TrendingUp` because 280px had no room for a
  // word, and a page does — see `goal-card.tsx`.
  await page.goto("/goals")
  await expect(card.getByText("Moving")).toBeVisible()

  // And the detail counts it the same way it counts a finished task.
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/1 finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")
})

test("a goal with nothing to track gets no momentum reading at all", async ({
  page,
}) => {
  // No milestones, no linked tasks, no numeric target. `currentValue` is overwritten in
  // place with no history, so there is genuinely nothing to measure — and a stalled badge
  // here would be a lie about a goal that might have been updated an hour ago.
  const goalTitle = `E2E untracked ${Date.now()}`
  await seedGoal({ title: goalTitle, createdAt: OLD_ENOUGH })

  await page.goto("/goals")
  await expect(goalCard(page, goalTitle).getByText("Stalled")).toHaveCount(0)
  await openDetail(page, goalTitle)
  const detail = page.getByRole("dialog")
  await expect(detail.getByText("No milestones or target yet.")).toBeVisible()
  await expect(detail.getByText(/finished in the last/)).toHaveCount(0)
  await page.keyboard.press("Escape")
})

test("the momentum window follows the setting", async ({ page }) => {
  const goalTitle = `E2E window ${Date.now()}`
  const taskTitle = `E2E window task ${Date.now()}`
  const goalId = await seedGoal({ title: goalTitle, createdAt: OLD_ENOUGH })
  await seedTask({ title: taskTitle, goalId })

  // Scoped to the control's own group, not the page. Two segmented controls in this form
  // offer "1 week" and "2 weeks" — this one and the Slate horizon — so an unscoped lookup
  // matches both and strict mode rejects it. That collision is also why `Segmented` takes a
  // required `label`: the group had no accessible name at all until T16, which made the two
  // indistinguishable to a screen reader as well as to this line.
  const window = page.getByRole("group", { name: "Goal momentum window" })

  await page.goto("/settings")
  await window.getByRole("button", { name: "1 week" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await page.goto("/goals")
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/in the last week/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // Put it back — the suite runs serially against a persistent database, so a changed
  // setting would silently retune every later assertion about the copy.
  await page.goto("/settings")
  await window.getByRole("button", { name: "2 weeks" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()
})

/**
 * The bug the grace exists for, reported from real use: a goal created and immediately told
 * it had stalled, about work nobody had yet had a chance to do.
 *
 * Seeded at `now()` — `seedGoal`'s default — because that is exactly what creating one
 * through the dialog produces. It differs from the untracked case above in the reason for
 * the silence rather than the silence itself: this goal HAS something to measure, an open
 * linked task, and is simply too young to be judged on it.
 */
test("a goal made today is not called stalled", async ({ page }) => {
  const stamp = Date.now()
  const goalTitle = `E2E momentum fresh ${stamp}`
  const taskTitle = `E2E momentum fresh task ${stamp}`

  const goalId = await seedGoal({ title: goalTitle })
  await seedTask({ title: taskTitle, goalId })

  await page.goto("/goals")
  const card = goalCard(page, goalTitle)
  await expect(card).toHaveCount(1)
  await expect(card.getByText("Stalled")).toHaveCount(0)
  // Nor the opposite: withholding a false accusation must not invent a compliment.
  await expect(card.getByText("Moving")).toHaveCount(0)

  // And the detail says nothing about a window the goal has not lived through.
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/finished in the last/),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
})
