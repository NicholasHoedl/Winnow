import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  createTask,
  createTaskRecurrence,
  updateTask,
  updateTaskRecurrence,
} from "@/modules/todos/actions"
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

/** Only the columns the dialog reads — see the note in `transaction-dialog.test.tsx`. */
function task(over: Record<string, unknown> = {}): TaskWithSeries {
  return {
    id: "task-1",
    title: "Water the plants",
    notes: null,
    dueDate: "2026-09-10",
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
 * Nothing below touches the List, Goal, Event or Repeat controls: all four are base-ui
 * `Select`s driven by pointer events jsdom does not implement. They stay in `e2e/`.
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
    vi.mocked(createTask).mockResolvedValue({ ok: true })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Pay rent" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1))
    expect(createTaskRecurrence).not.toHaveBeenCalled()
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
