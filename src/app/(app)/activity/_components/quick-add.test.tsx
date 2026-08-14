import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { createTask } from "@/modules/todos/actions"

import { QuickAdd } from "./quick-add"

// `"use server"` — importing for real would drag in the database. Only the return value
// matters here; the point of this file is what the BUTTON does while it is unresolved.
vi.mock("@/modules/todos/actions", () => ({ createTask: vi.fn() }))

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

/** A promise this test resolves by hand, so "in flight" is an observable state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((r) => (resolve = r)), resolve }
}

/**
 * The quick-add bars are the app's fastest-capture surface, and the one place where the
 * obvious way to show "busy" is forbidden.
 *
 * `docs/HANDOFF.md` records the bug: a form whose submit button is `disabled` performs no
 * implicit submission, so Enter goes dead while a write is in flight and anything typed in
 * that ~300ms window vanishes with no row, no toast and no error. The fix was `aria-busy`
 * — but `aria-busy` on its own rendered nothing at all, which is how these four bars ended
 * up with a correct accessibility signal and zero visible feedback.
 *
 * So there are two invariants here and they pull against each other: the button must LOOK
 * busy, and it must stay submittable. `not.toBeDisabled()` is the load-bearing assertion —
 * it is what stops someone "tidying" this into `disabled={pending}` and silently
 * reintroducing a bug that took a submit-event listener to diagnose the first time.
 *
 * Unit rather than e2e deliberately: an e2e would be racing a sub-second window and would
 * eventually flake, which this suite treats as a triage item rather than noise. A gated
 * promise makes the same window infinitely wide and perfectly deterministic.
 */
describe("QuickAdd", () => {
  beforeEach(() => {
    vi.mocked(createTask).mockReset()
    toast.mockReset()
    toast.error.mockReset()
  })

  it("looks busy while the write is in flight, and stays submittable", async () => {
    const gate = deferred<{ ok: true }>()
    vi.mocked(createTask).mockReturnValue(gate.promise)

    render(<QuickAdd />)
    const button = screen.getByRole("button", { name: "Add task" })
    expect(button).not.toHaveAttribute("aria-busy", "true")

    fireEvent.change(screen.getByLabelText("Quick add task"), {
      target: { value: "Pay rent" },
    })
    fireEvent.submit(button.closest("form")!)

    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"))
    // The visible half — without this the attribute above is screen-reader-only.
    expect(button.querySelector("[data-pending]")).not.toBeNull()
    // The half that must never regress. See the note above this describe block.
    expect(button).not.toBeDisabled()

    gate.resolve({ ok: true })
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy", "true"))
    expect(button.querySelector("[data-pending]")).toBeNull()
  })

  it("clears the field synchronously, before the write resolves", async () => {
    const gate = deferred<{ ok: true }>()
    vi.mocked(createTask).mockReturnValue(gate.promise)

    render(<QuickAdd />)
    const input = screen.getByLabelText<HTMLInputElement>("Quick add task")
    fireEvent.change(input, { target: { value: "Pay rent" } })
    fireEvent.submit(input.closest("form")!)

    // Empty already, with the action still unresolved — this is what lets a second Enter
    // inside the window submit nothing rather than resubmitting the first entry.
    expect(input.value).toBe("")
    gate.resolve({ ok: true })
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith({ title: "Pay rent" }),
    )
  })

  it("restores the text when the write fails", async () => {
    vi.mocked(createTask).mockResolvedValue({ ok: false, error: "Nope." })

    render(<QuickAdd />)
    const input = screen.getByLabelText<HTMLInputElement>("Quick add task")
    fireEvent.change(input, { target: { value: "Pay rent" } })
    fireEvent.submit(input.closest("form")!)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nope."))
    expect(input.value).toBe("Pay rent")
  })
})
