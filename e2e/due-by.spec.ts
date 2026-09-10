import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { deleteTasksMatching, seedTask } from "./_tasks"

// T28: a due date is a day or a deadline.
//
// Which tasks are deadlines, and where each lands on the Slate, is `buildSlate`'s decision
// and has its unit tests; the dialog's toggle and the parser's "by" have theirs. What only a
// browser can prove is the wiring end to end — that a `by` written by any of the three ways
// of setting it is what the dashboard and the Tasks page then say.

/** ISO date `n` days from today, in the browser's zone — the one the app renders in. */
function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

/** The name of the weekday `n` days from today, for the quick-capture phrase. */
function weekdayInDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return WEEKDAYS[d.getDay()]
}

test.afterEach(async () => {
  for (const prefix of ["E2E deadline", "E2E dated"])
    await deleteTasksMatching(prefix)
})

test("a deadline is on the dashboard from the day it is set; a dated task waits for its day", async ({
  page,
}) => {
  const stamp = Date.now()
  const ahead = `E2E deadline ahead ${stamp}`
  const arrived = `E2E deadline today ${stamp}`
  const dated = `E2E dated ${stamp}`

  // Seeded rather than clicked: the spec is about where they land, not how they are made.
  await seedTask({ title: ahead, dueDate: inDays(5), dueKind: "by" })
  await seedTask({ title: arrived, dueDate: inDays(0), dueKind: "by" })
  await seedTask({ title: dated, dueDate: inDays(5) })

  await page.goto("/")
  const slate = page.getByRole("region", { name: "Slate" })
  await expect(slate.getByRole("heading", { name: "Due by" })).toBeVisible()
  await expect(slate.getByText(ahead)).toBeVisible()
  // The one whose day has come sits in Today and says so.
  await expect(slate.getByText(arrived)).toBeVisible()
  await expect(slate.getByText("Due by today")).toBeVisible()
  // The control: the same date, without "by", is nowhere on the card. Before T28 it was
  // a "Sat 23" band of its own, which is the preview the user asked to lose.
  await expect(slate.getByText(dated)).toHaveCount(0)

  // The Tasks page says the same thing in its badges.
  await page.goto("/activity")
  await expect(visibleCard(page, ahead).getByText(/^By /)).toBeVisible()
  await expect(
    visibleCard(page, arrived).getByText("Due by today"),
  ).toBeVisible()
  await expect(visibleCard(page, dated).getByText(/^By /)).toHaveCount(0)
})

test("quick capture reads 'by' as a deadline", async ({ page }) => {
  const title = `E2E deadline captured ${Date.now()}`

  await page.goto("/")
  const bar = page.getByLabel("Quick add a task")
  // Three days out: never today, whatever weekday it is, so the row lands in Due by
  // rather than in Today.
  await bar.fill(`${title} by ${weekdayInDays(3)}`)
  await bar.press("Enter")
  await expect(page.getByText(`Added “${title}”`)).toBeVisible()

  const slate = page.getByRole("region", { name: "Slate" })
  await expect(slate.getByRole("heading", { name: "Due by" })).toBeVisible()
  await expect(slate.getByText(title)).toBeVisible()
})

test("the task dialog can make a date a deadline, and remembers it", async ({
  page,
}) => {
  const title = `E2E deadline dialog ${Date.now()}`

  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByLabel("Due date").fill(inDays(4))
  await dialog
    .getByRole("group", { name: "Due on or by" })
    .getByRole("button", { name: "Due by" })
    .click()
  await dialog.getByRole("button", { name: "Create" }).click()

  const row = visibleCard(page, title)
  await expect(row.getByText(/^By /)).toBeVisible()

  // Reopened, the toggle shows the choice that was saved.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Due by" }),
  ).toHaveAttribute("aria-pressed", "true")
})
