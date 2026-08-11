import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { deleteEntry, logEntry } from "./actions"
import { useLogHabit } from "./use-log-habit"

// The actions are `"use server"`; importing them for real would drag in the DB. Only their
// return values matter here — the point of the test is what the hook does WITH them.
vi.mock("./actions", () => ({
  logEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

// `toast(...)` and `toast.error(...)` are both used, so the mock has to be callable AND
// carry the method. Hoisted because vi.mock's factory runs before the module body.
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const HABIT = { id: "habit-1", title: "Jiu-jitsu" }

/** A promise this test resolves by hand, so "in flight" is an observable state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((r) => (resolve = r)), resolve }
}

function Harness() {
  const { pendingId, log } = useLogHabit()
  return (
    <>
      <button onClick={() => log(HABIT)}>log</button>
      <span data-testid="pending">{pendingId ?? "none"}</span>
    </>
  )
}

/** Press Undo on the most recent `toast(...)`. */
function clickUndo(): void {
  const [, options] = toast.mock.calls.at(-1) as [
    string,
    { action: { label: string; onClick: () => void } },
  ]
  expect(options.action.label).toBe("Undo")
  options.action.onClick()
}

describe("useLogHabit", () => {
  beforeEach(() => {
    vi.mocked(logEntry).mockReset()
    vi.mocked(deleteEntry).mockReset()
    toast.mockReset()
    toast.error.mockReset()
  })

  // The reason the hook exists in this module rather than in `components/`: undo is bound
  // to the id the write RETURNED, not to a re-derived "today's entry", because there can
  // legitimately be three of those.
  it("undoes by deleting exactly the row the action returned", async () => {
    vi.mocked(logEntry).mockResolvedValue({ ok: true, entryId: "entry-9" })
    vi.mocked(deleteEntry).mockResolvedValue({ ok: true })

    render(<Harness />)
    fireEvent.click(screen.getByText("log"))

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0]).toBe("Logged Jiu-jitsu")

    // Inside `act` because the undo opens a transition of its own. In the app that happens
    // from sonner's button — a real React event; here the handler is called directly, and
    // outside `act` React never flushes the transition it schedules.
    await act(async () => clickUndo())
    expect(deleteEntry).toHaveBeenCalledWith("entry-9")
  })

  it("marks the logged habit pending in flight, and clears it after", async () => {
    const gate = deferred<{ ok: true; entryId: string }>()
    vi.mocked(logEntry).mockReturnValue(gate.promise)

    render(<Harness />)
    expect(screen.getByTestId("pending")).toHaveTextContent("none")

    fireEvent.click(screen.getByText("log"))
    await waitFor(() =>
      expect(screen.getByTestId("pending")).toHaveTextContent("habit-1"),
    )

    gate.resolve({ ok: true, entryId: "entry-9" })
    await waitFor(() =>
      expect(screen.getByTestId("pending")).toHaveTextContent("none"),
    )
  })

  it("toasts a failure and offers no undo", async () => {
    vi.mocked(logEntry).mockResolvedValue({
      ok: false,
      error: "Unknown habit.",
    })

    render(<Harness />)
    fireEvent.click(screen.getByText("log"))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Unknown habit."),
    )
    expect(toast).not.toHaveBeenCalled()
    expect(deleteEntry).not.toHaveBeenCalled()

    // Still released, or the control would stay disabled after a recoverable failure.
    await waitFor(() =>
      expect(screen.getByTestId("pending")).toHaveTextContent("none"),
    )
  })
})
