import { describe, expect, it } from "vitest"

import {
  areaPath,
  barLayout,
  linePath,
  niceScale,
  scaleY,
  slotCenter,
} from "./geometry"

describe("niceScale", () => {
  it("rounds the top of the domain up to a readable tick", () => {
    const scale = niceScale(0, 1247)
    expect(scale.min).toBe(0)
    expect(scale.max).toBeGreaterThanOrEqual(1247)
    // Every tick is a whole multiple of the step, so labels read cleanly.
    for (const tick of scale.ticks) {
      expect(Math.abs(tick % scale.step)).toBeLessThan(1e-6)
    }
    expect(scale.ticks[0]).toBe(scale.min)
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max)
  })

  it("always includes zero, so bars grow from a real baseline", () => {
    expect(niceScale(500, 900).min).toBe(0)
  })

  it("spans a negative domain — net income goes below zero", () => {
    const scale = niceScale(-620, 400)
    expect(scale.min).toBeLessThanOrEqual(-620)
    expect(scale.max).toBeGreaterThanOrEqual(400)
    expect(scale.ticks).toContain(0)
  })

  it("handles an all-negative series", () => {
    const scale = niceScale(-900, -100)
    expect(scale.min).toBeLessThanOrEqual(-900)
    expect(scale.max).toBe(0)
  })

  it("gives an all-zero series a usable placeholder domain", () => {
    // Not a divide-by-zero span, and the axis still renders.
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 1, step: 1, ticks: [0, 1] })
  })

  it("handles max === 0 with negative data", () => {
    const scale = niceScale(-50, 0)
    expect(scale.max).toBe(0)
    expect(scale.min).toBeLessThan(0)
  })
})

describe("scaleY", () => {
  const scale = niceScale(0, 100)

  it("puts the domain minimum at the bottom and the maximum at the top", () => {
    expect(scaleY(scale.min, scale, 200)).toBe(200)
    expect(scaleY(scale.max, scale, 200)).toBe(0)
  })

  it("is linear in between", () => {
    const mid = (scale.min + scale.max) / 2
    expect(scaleY(mid, scale, 200)).toBeCloseTo(100)
  })

  it("places zero correctly inside a negative domain", () => {
    const negative = niceScale(-100, 100)
    expect(scaleY(0, negative, 200)).toBeCloseTo(100)
  })
})

describe("barLayout", () => {
  it("returns evenly spaced, centred bars", () => {
    const bars = barLayout(4, 400)
    expect(bars).toHaveLength(4)
    const slot = 100
    bars.forEach((bar, i) => {
      const centre = bar.x + bar.width / 2
      expect(centre).toBeCloseTo(i * slot + slot / 2)
    })
    expect(bars[0].width).toBeLessThan(slot) // there is a gap
  })

  it("returns nothing for an empty series", () => {
    expect(barLayout(0, 400)).toEqual([])
  })

  it("keeps a bar visible even when crowded", () => {
    expect(barLayout(300, 100)[0].width).toBeGreaterThanOrEqual(1)
  })
})

describe("slotCenter", () => {
  it("lines points up with the centre of each bar slot", () => {
    expect(slotCenter(0, 4, 400)).toBe(50)
    expect(slotCenter(3, 4, 400)).toBe(350)
  })
})

describe("paths", () => {
  const points = [
    { x: 0, y: 10 },
    { x: 10, y: 0 },
    { x: 20, y: 5 },
  ]

  it("linePath moves to the first point and lines through the rest", () => {
    expect(linePath(points)).toBe("M0 10 L10 0 L20 5")
  })

  it("areaPath closes the shape down to the baseline", () => {
    const path = areaPath(points, 40)
    expect(path.startsWith("M0 10")).toBe(true)
    expect(path.endsWith("L20 40 L0 40 Z")).toBe(true)
  })

  it("both return empty for no points", () => {
    expect(linePath([])).toBe("")
    expect(areaPath([], 40)).toBe("")
  })
})
