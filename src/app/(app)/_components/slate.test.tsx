import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { reorderTasks, toggleTaskStatus } from "@/modules/todos/actions"
import type { TaskWithSeries } from "@/modules/todos/queries"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"
import type { SlateBand } from "../_lib/agenda"

import { Slate } from "./slate"

vi.mock("@/modules/todos/actions", () => ({
  toggleTaskStatus: vi.fn(),
  reorderTasks: vi.fn(),
}))
// The fold is a Server Action on the card shell around this component, not on it.
vi.mock("@/modules/preferences/actions", () => ({ setDashboardCard: vi.fn() }))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

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
    routineId: null,
    occurrenceDate: null,
    completedAt: null,
    series: null,
    subtasks: [],
    ...over,
  } as unknown as TaskWithSeries
}

/** One band holding the given tasks, which is all these assertions need. */
function bands(
  tasks: TaskWithSeries[],
): SlateBand<TaskWithSeries, EventOccurrence>[] {
  return [
    {
      date: "2026-09-10",
      label: "Today",
      items: tasks.map((t) => ({ kind: "task" as const, time: null, task: t })),
      groups: [],
    },
  ]
}

function show(props: Partial<React.ComponentProps<typeof Slate>> = {}) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <Slate
        overdue={[]}
        dueBy={[]}
        bands={bands([task()])}
        calendars={[] as unknown as Calendar[]}
        use24Hour={false}
        collapsed={false}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * jsdom implements no `PointerEvent`, and base-ui's `Checkbox` constructs one on click, so
 * without this the click is simply never delivered and the assertions below fail for a
 * reason that has nothing to do with the component.
 *
 * **This is not the same accommodation the Select tests refuse.** Supplying a missing DOM
 * constructor leaves the component's own handler, its optimistic state and its Server Action
 * call running for real; faking a popover's pointer choreography would leave the test
 * asserting against the fake. The line is whether the thing under test still does the work,
 * and here it does — the mutation checks on this file are what prove it.
 */
if (!("PointerEvent" in window)) {
  // @ts-expect-error — a constructor is all base-ui asks for.
  window.PointerEvent = class extends MouseEvent {}
}

/** A promise this test resolves by hand, so "in flight" is an observable state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((r) => (resolve = r)), resolve }
}

/**
 * Ticking a task off on the dashboard.
 *
 * The first test is here for the reason `quick-add.test.tsx` gives about its own: the
 * window it asserts on is the gap between the click and the Server Action resolving, and an
 * e2e racing that would flake. A gated promise makes the window infinitely wide.
 *
 * The second is the behaviour shipped after "completing a task removes it from the
 * dashboard" was reported from real use. The rule that keeps a ticked row on the board lives
 * in `_lib/agenda.ts` and has its own tests; what is pinned here is the other half — that
 * the row, once it is still there, actually READS as done.
 */
describe("Slate", () => {
  beforeEach(() => {
    vi.mocked(toggleTaskStatus).mockReset()
    vi.mocked(reorderTasks).mockReset()
    toast.error.mockReset()
  })

  it("flips the row before the write resolves, and keeps it on the board", async () => {
    const gate = deferred<{ ok: true }>()
    vi.mocked(toggleTaskStatus).mockReturnValue(gate.promise)
    show()

    fireEvent.click(screen.getByLabelText("Complete Water the plants"))

    // Still unresolved, and the row already reads as done rather than vanishing.
    await waitFor(() =>
      expect(
        screen.getByLabelText("Reopen Water the plants"),
      ).toBeInTheDocument(),
    )
    expect(toggleTaskStatus).toHaveBeenCalledWith("task-1")

    gate.resolve({ ok: true })
  })

  it("draws a task that is already done as done", () => {
    show({ bands: bands([task({ status: "done" })]) })

    expect(screen.getByLabelText("Reopen Water the plants")).toBeInTheDocument()
    expect(screen.getByText("Water the plants")).toHaveClass("line-through")
  })

  it("surfaces a refused toggle rather than swallowing it", async () => {
    vi.mocked(toggleTaskStatus).mockResolvedValue({
      ok: false,
      error: "That task is gone.",
    })
    show()

    fireEvent.click(screen.getByLabelText("Complete Water the plants"))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That task is gone."),
    )
  })

  // Emptiness is about CONTENT, not about `bands.length` — `buildSlate` always emits the
  // Today band, so counting bands would call a clear day busy.
  it("says the day is clear when every band is empty", () => {
    show({ overdue: [], bands: bands([]) })

    expect(
      screen.getByText(/Nothing due and nothing scheduled/),
    ).toBeInTheDocument()
  })

  /**
   * T28: a deadline is on the board from the day it is set. Which tasks are deadlines is
   * `buildSlate`'s decision and has its tests; what is pinned here is that the block draws
   * them with their day, that a deadline whose day has come says so in today's list, and
   * that a pending deadline keeps the card from calling the day clear.
   */
  it("lists a deadline under Due by, with its day", () => {
    show({
      bands: bands([]),
      dueBy: [
        task({
          id: "task-2",
          title: "Renew passport",
          dueDate: "2026-09-23",
          dueKind: "by",
        }),
      ],
    })

    expect(screen.getByRole("heading", { name: "Due by" })).toBeInTheDocument()
    expect(screen.getByText("Renew passport")).toBeInTheDocument()
    expect(screen.getByText("Sep 23")).toBeInTheDocument()
    expect(
      screen.queryByText(/Nothing due and nothing scheduled/),
    ).not.toBeInTheDocument()
  })

  it("says 'due by today' on a deadline whose day has come", () => {
    show({ bands: bands([task({ dueKind: "by" })]) })

    expect(screen.getByText("Due by today")).toBeInTheDocument()
  })

  it("does not say it of a task that is simply due today", () => {
    show()

    expect(screen.queryByText("Due by today")).not.toBeInTheDocument()
  })
})
