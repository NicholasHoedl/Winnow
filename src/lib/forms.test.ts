import { beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import {
  numberField,
  optionalNumberField,
  restoreIfEmpty,
  tryWrite,
  UNREACHABLE_MESSAGE,
} from "./forms"

describe("restoreIfEmpty", () => {
  it("puts a failed entry back when the field is untouched", () => {
    expect(restoreIfEmpty("buy milk")("")).toBe("buy milk")
  })

  // The case it exists for: the failure write lands after the await, by which time the
  // next entry may already be half typed.
  it("leaves newer text alone", () => {
    expect(restoreIfEmpty("buy milk")("call mom")).toBe("call mom")
  })

  it("leaves a partially typed next entry alone", () => {
    expect(restoreIfEmpty("buy milk")("c")).toBe("c")
  })
})

describe("numberField", () => {
  it("maps an empty input to 0", () => {
    expect(numberField.setValueAs("")).toBe(0)
    expect(numberField.setValueAs("12")).toBe(12)
  })
})

describe("optionalNumberField", () => {
  it("maps empty and null to null, so the column stays NULL", () => {
    expect(optionalNumberField.setValueAs("")).toBeNull()
    expect(optionalNumberField.setValueAs("  ")).toBeNull()
    // RHF calls this with the CURRENT value during registration, which may be null.
    expect(optionalNumberField.setValueAs(null)).toBeNull()
    expect(optionalNumberField.setValueAs(undefined)).toBeNull()
  })

  it("keeps a real zero distinct from absent", () => {
    expect(optionalNumberField.setValueAs("0")).toBe(0)
    expect(optionalNumberField.setValueAs("2.5")).toBe(2.5)
  })
})

describe("tryWrite", () => {
  beforeEach(() => {
    toast.error.mockReset()
  })

  it("hands back whatever the action returned, and says nothing", async () => {
    const result = await tryWrite(async () => ({ ok: true as const, id: "t1" }))

    expect(result).toEqual({ ok: true, id: "t1" })
    expect(toast.error).not.toHaveBeenCalled()
  })

  // A failure the ACTION returns is the action's to explain — it may belong on a field.
  it("leaves a typed failure alone", async () => {
    const failure = { ok: false as const, error: "Pick a category." }
    const result = await tryWrite(async () => failure)

    expect(result).toBe(failure)
    expect(toast.error).not.toHaveBeenCalled()
  })

  // The case it exists for: the fetch behind a Server Action rejects with the network
  // off. Unhandled, that rejection replaces the whole route with its error boundary and
  // takes the typed text with it.
  it("turns a dropped connection into a message, not a thrown page", async () => {
    const result = await tryWrite(async () => {
      throw new TypeError("Failed to fetch")
    })

    expect(result).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(UNREACHABLE_MESSAGE)
    expect(UNREACHABLE_MESSAGE).toMatch(/nothing was saved/i)
  })
})
