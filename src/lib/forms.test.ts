import { describe, expect, it } from "vitest"

import { numberField, optionalNumberField, restoreIfEmpty } from "./forms"

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
