import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { createHabit } from "@/modules/habits/actions"

import { HabitDialog } from "./habit-dialog"

// `"use server"` — importing for real drags in the database. Same treatment as
// `transaction-dialog.test.tsx`: only the return value matters here.
vi.mock("@/modules/habits/actions", () => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

function show() {
  return render(
    <HabitDialog habit={null} goals={[]} open onOpenChange={vi.fn()} />,
  )
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Add" }))
}

/**
 * Pass 8: whose words answer a bad number.
 *
 * The quota field carries `min={1} max={100}` and `type="number"`, so the browser
 * answered first — "Value must be greater than or equal to 1.", and for `1.5` a sentence
 * naming "the two nearest valid values". `habitInputSchema` has had better answers all
 * along ("At least one", "Whole sessions only") and neither could ever be seen. `noValidate`
 * is what makes zod the one voice; these pin that it stayed that way.
 */
describe("HabitDialog validation", () => {
  beforeEach(() => {
    vi.mocked(createHabit).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  // The dialog portals out of `container`, so the form is looked up on the document.
  it("leaves validation to the schema, not to the browser", () => {
    show()
    expect(document.querySelector("form")).toHaveAttribute("novalidate")
  })

  it("says what the floor is, in its own words", async () => {
    show()

    fireEvent.change(screen.getByLabelText("How often"), {
      target: { value: "0" },
    })
    submit()

    await waitFor(() =>
      expect(screen.getByText("At least one")).toBeInTheDocument(),
    )
    expect(createHabit).not.toHaveBeenCalled()
  })

  it("says a session is a whole thing", async () => {
    show()

    fireEvent.change(screen.getByLabelText("How often"), {
      target: { value: "1.5" },
    })
    submit()

    await waitFor(() =>
      expect(screen.getByText("Whole sessions only")).toBeInTheDocument(),
    )
    expect(createHabit).not.toHaveBeenCalled()
  })

  it("still saves a rate the schema is happy with", async () => {
    vi.mocked(createHabit).mockResolvedValue({ ok: true, id: "h1" })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Attend class" },
    })
    fireEvent.change(screen.getByLabelText("How often"), {
      target: { value: "4" },
    })
    submit()

    await waitFor(() => expect(createHabit).toHaveBeenCalledTimes(1))
  })
})
