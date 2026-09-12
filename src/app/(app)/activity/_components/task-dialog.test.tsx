import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  createTask,
  createTaskRecurrence,
  updateTask,
  updateTaskRecurrence,
} from "@/modules/todos/actions"
import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption } from "@/modules/goals/queries"
import type { TaskWithSeries } from "@/modules/todos/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { TaskDialog } from "./task-dialog"

vi.mock("@/modules/todos/actions", () => ({
  createTask: vi.fn(),
  createTaskRecurrence: vi.fn(),
  updateTask: vi.fn(),
  updateTaskRecurrence: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/**
 * A complete rule, not a stub. Switching scope resets the whole form from these, and
 * `RecurrenceFields` then reads `startDate` through `dowOf` — a half-filled fixture crashes
 * the render rather than failing an assertion, which is a useful thing for it to insist on.
 */
const SERIES = {
  id: "rule-1",
  title: "Water the plants",
  notes: null,
  priority: "medium",
  listId: null,
  freq: "weekly",
  recurrenceInterval: 1,
  weekdays: 2,
  monthlyMode: "day_of_month",
  flexible: false,
  startDate: "2026-09-07",
  endDate: null,
}

const GOALS: GoalOption[] = [{ id: "goal-1", title: "Run a half" }]
const EVENTS: EventOption[] = [
  {
    id: "event-1",
    title: "Race day",
    startAt: new Date("2026-10-04T13:00:00Z"),
    allDay: false,
  },
]

/** Only the columns the dialog reads — see the note in `transaction-dialog.test.tsx`. */
function task(over: Record<string, unknown> = {}): TaskWithSeries {
  return {
    id: "task-1",
    title: "Water the plants",
    notes: null,
    dueDate: "2026-09-10",
    dueKind: "on",
    priority: "medium",
    status: "open",
    listId: null,
    goalId: null,
    eventId: null,
    seriesId: null,
    occurrenceDate: null,
    completedAt: null,
    series: null,
    subtasks: [],
    ...over,
  } as unknown as TaskWithSeries
}

/**
 * Choose an item in a base-ui `Select`. The popup opens on a plain click — `PointerEvent`
 * is polyfilled in `vitest.setup.ts` — but an item commits on its key handler, not on a
 * synthetic click, so Enter on the option is what actually picks it.
 */
function pickOption(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label))
  fireEvent.keyDown(screen.getByRole("option", { name: option }), {
    key: "Enter",
  })
}

function show(props: Partial<React.ComponentProps<typeof TaskDialog>> = {}) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <TaskDialog
        lists={[]}
        goals={[]}
        events={[]}
        task={null}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * The same four-way dispatch `TransactionDialog` carries, and tested the same way and for
 * the same reason — the branches are cheap here and expensive in a browser, and the
 * server-rejects path is one a browser cannot arrange at all.
 *
 * The invariant worth the most is the third one. A recurring task's dialog opens on "This
 * task", and Save there must edit the ROW; reaching the rule is a deliberate second act.
 * Getting that backwards would silently rewrite a whole schedule from an edit someone
 * thought applied to one day, which is both the worst outcome here and an entirely
 * plausible refactor.
 *
 * The List picker stays out of this file: what it does with its answer is a browser
 * journey. The Goal, Event and Repeat controls are here only for what the dialog ASSUMES
 * before anyone touches them — see `pickOption` for how far a base-ui `Select` can be
 * driven under jsdom.
 */
describe("TaskDialog", () => {
  beforeEach(() => {
    vi.mocked(createTask).mockReset()
    vi.mocked(createTaskRecurrence).mockReset()
    vi.mocked(updateTask).mockReset()
    vi.mocked(updateTaskRecurrence).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("sends a new one-off to createTask", async () => {
    vi.mocked(createTask).mockResolvedValue({ ok: true, id: "t1" })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Pay rent" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1))
    expect(createTaskRecurrence).not.toHaveBeenCalled()
  })

  it("sends the due kind the toggle says", async () => {
    vi.mocked(createTask).mockResolvedValue({ ok: true, id: "t1" })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Renew passport" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Due by" }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({
      dueKind: "by",
    })
  })

  it("offers the kind only while there is a date to bind", () => {
    // A new task prefills today, so the toggle is there; clear the date and it goes.
    show()
    const toggle = () => screen.queryByRole("group", { name: "Due on or by" })
    expect(toggle()).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "" },
    })
    expect(toggle()).not.toBeInTheDocument()
  })

  it("edits a one-off through updateTask, by id", async () => {
    vi.mocked(updateTask).mockResolvedValue({ ok: true })
    show({ task: task() })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateTask).mock.calls[0][0]).toBe("task-1")
  })

  // The one that matters most. See the note above this block.
  it("edits only the row when a recurring task opens on This task", async () => {
    vi.mocked(updateTask).mockResolvedValue({ ok: true })
    show({ task: task({ series: SERIES, seriesId: "rule-1" }) })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateTask).mock.calls[0][0]).toBe("task-1")
    expect(updateTaskRecurrence).not.toHaveBeenCalled()
  })

  it("edits the rule once the scope toggle says Series", async () => {
    vi.mocked(updateTaskRecurrence).mockResolvedValue({ ok: true })
    show({ task: task({ series: SERIES, seriesId: "rule-1" }) })

    fireEvent.click(screen.getByRole("button", { name: "Series" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateTaskRecurrence).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateTaskRecurrence).mock.calls[0][0]).toBe("rule-1")
    expect(updateTask).not.toHaveBeenCalled()
  })

  // Pass 0 measured linking as rare, and both pickers were full-width rows on every new
  // task the moment the account held one goal or one event.
  it("keeps the goal and event pickers behind a disclosure", () => {
    show({ goals: GOALS, events: EVENTS })

    expect(screen.getByText("Link to a goal or event")).toBeInTheDocument()
    expect(screen.getByLabelText("Goal")).not.toBeVisible()
    expect(screen.getByLabelText("Event")).not.toBeVisible()
  })

  // The block renders for goals OR events, so the summary has to name what is actually
  // behind it — an account with no calendar events was told it could link to one.
  it("names only the links it actually offers", () => {
    show({ goals: GOALS })

    expect(screen.getByText("Link to a goal")).toBeInTheDocument()
  })

  // A server error on a hidden field is an error nobody can see: the disclosure opens for
  // one, the way it opens for a link the task already carries.
  it("opens the disclosure when the server rejects a link", async () => {
    vi.mocked(createTask).mockResolvedValue({
      ok: false,
      error: "Could not save that.",
      fieldErrors: { goalId: "That goal is archived." },
    })
    show({ goals: GOALS, events: EVENTS })

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Long run" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() =>
      expect(screen.getByText("That goal is archived.")).toBeInTheDocument(),
    )
    expect(screen.getByLabelText("Goal")).toBeVisible()
  })

  // A link a task already carries is not a rare control — it is part of what this task is,
  // and hiding it would make an edit silently drop it from view.
  it("opens the disclosure for a task that is already linked", () => {
    show({ goals: GOALS, events: EVENTS, task: task({ goalId: "goal-1" }) })

    expect(screen.getByLabelText("Goal")).toBeVisible()
  })

  // Tesler: `/activity?goal=…` has already said which goal this work belongs to, so the
  // dialog fills that in rather than asking again.
  it("opens it pre-linked when the page is filtered by a goal", async () => {
    vi.mocked(createTask).mockResolvedValue({ ok: true, id: "t1" })
    show({ goals: GOALS, events: EVENTS, initialGoalId: "goal-1" })

    expect(screen.getByLabelText("Goal")).toBeVisible()
    expect(screen.getByLabelText("Goal")).toHaveTextContent("Run a half")

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Long run" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({
      goalId: "goal-1",
    })
  })

  // Turning a dated task into a repeating one used to mean typing the date twice: the
  // recurrence start was seeded with today no matter what the due date said.
  it("starts a new repeat on the due date already typed", () => {
    show()

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    })
    pickOption("Repeat", "Weekly")

    expect(screen.getByLabelText("Starts")).toHaveValue("2026-12-01")
  })

  // Only the first choice fills it in — the field is still the user's after that, and
  // changing weekly to monthly must not undo an edit they made deliberately.
  it("leaves a start date the user has already changed alone", () => {
    show()

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    })
    pickOption("Repeat", "Weekly")
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2026-12-08" },
    })
    pickOption("Repeat", "Monthly")

    expect(screen.getByLabelText("Starts")).toHaveValue("2026-12-08")
  })

  /**
   * T41 (Pass 7): a `FieldLabel` above a row of buttons is a label pointing at nothing.
   * The buttons said "This task" and "Series" to a screen reader with no word about what
   * they decided, and the same row exists in the transaction and event dialogs.
   */
  it("names the scope toggle after its label", () => {
    show({ task: task({ series: SERIES, seriesId: "rule-1" }) })

    expect(
      screen.getByRole("group", { name: "Apply changes to" }),
    ).toContainElement(screen.getByRole("button", { name: "Series" }))
  })

  it("names the repeat toggles after their labels", () => {
    show()

    pickOption("Repeat", "Weekly")
    expect(screen.getByRole("group", { name: "On days" })).toContainElement(
      screen.getByRole("button", { name: "Monday" }),
    )

    pickOption("Repeat", "Monthly")
    expect(screen.getByRole("group", { name: "On" })).toBeVisible()
  })

  // base-ui's SelectValue needs a function child; a bare one renders the raw stored value,
  // so this trigger read "medium" while every other select in the app read a label.
  it("names the priority rather than showing its stored value", () => {
    show()

    expect(screen.getByLabelText("Priority")).toHaveTextContent("Medium")
  })

  it("puts a server field error on the field that caused it", async () => {
    vi.mocked(createTask).mockResolvedValue({
      ok: false,
      error: "Could not save that.",
      fieldErrors: { title: "That title is already taken." },
    })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Pay rent" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() =>
      expect(
        screen.getByText("That title is already taken."),
      ).toBeInTheDocument(),
    )
    expect(toast.error).toHaveBeenCalledWith("Could not save that.")
  })
})
