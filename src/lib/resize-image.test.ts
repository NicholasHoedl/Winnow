import { describe, expect, it } from "vitest"

import { fitWithin, RECEIPT_MAX_EDGE } from "./resize-image"

describe("fitWithin", () => {
  it("leaves a photo that already fits alone", () => {
    expect(fitWithin(1200, 900, RECEIPT_MAX_EDGE)).toEqual({
      width: 1200,
      height: 900,
    })
    expect(fitWithin(1600, 1600, RECEIPT_MAX_EDGE)).toEqual({
      width: 1600,
      height: 1600,
    })
  })

  it("caps the long edge and keeps the shape, portrait or landscape", () => {
    // A 12-megapixel phone photo, portrait: the height is the long edge.
    expect(fitWithin(3024, 4032, RECEIPT_MAX_EDGE)).toEqual({
      width: 1200,
      height: 1600,
    })
    expect(fitWithin(4032, 3024, RECEIPT_MAX_EDGE)).toEqual({
      width: 1600,
      height: 1200,
    })
  })

  it("never rounds a thin strip down to nothing", () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})
