import { beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

import { UNDO_TOAST_MS, undoToast } from "./toast"

describe("undoToast", () => {
  beforeEach(() => {
    toast.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
  })

  // The reason this helper exists: sonner's default is 4 seconds, which is how long
  // every undo in the app used to stand. A window you have to already be looking at is
  // not an undo.
  it("stands longer than sonner's default", () => {
    undoToast("Task deleted", vi.fn())

    expect(UNDO_TOAST_MS).toBeGreaterThan(4000)
    expect(toast.mock.calls[0][1]).toMatchObject({ duration: UNDO_TOAST_MS })
  })

  it("carries one Undo action, wired to the caller's handler", () => {
    const undo = vi.fn()
    undoToast("Task deleted", undo)

    const options = toast.mock.calls[0][1]
    expect(options.action.label).toBe("Undo")
    options.action.onClick()
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it("keeps the success variant, for a toast that reports a creation", () => {
    undoToast("Added 3 tasks", vi.fn(), { variant: "success" })

    expect(toast).not.toHaveBeenCalled()
    expect(toast.success.mock.calls[0][1]).toMatchObject({
      duration: UNDO_TOAST_MS,
    })
  })

  // A write that failed part way still leaves rows worth taking back, so the red toast
  // has to carry the button too.
  it("keeps the error variant, and still carries the Undo", () => {
    undoToast("Couldn't add that", vi.fn(), { variant: "error" })

    expect(toast).not.toHaveBeenCalled()
    expect(toast.error.mock.calls[0][1]).toMatchObject({
      duration: UNDO_TOAST_MS,
    })
    expect(toast.error.mock.calls[0][1].action.label).toBe("Undo")
  })

  it("passes a description through", () => {
    undoToast("Logged Reading", vi.fn(), { description: "+12" })

    expect(toast.mock.calls[0][1]).toMatchObject({ description: "+12" })
  })
})
