import { describe, expect, it } from "vitest"

import {
  areaPath,
  barLayout,
  linePath,
  niceScale,
  ringArc,
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

  it("fits the domain to the data when asked, leaving zero out", () => {
    // A body weight series. On a zero-based axis these three points land inside the
    // top 2% of the plot and read as a flat line, which is the whole reason for the
    // option — so the assertion is that the domain actually hugs the data.
    const scale = niceScale(180.2, 182.4, 4, "data")
    expect(scale.min).toBeGreaterThan(170)
    expect(scale.min).toBeLessThanOrEqual(180.2)
    expect(scale.max).toBeGreaterThanOrEqual(182.4)
    expect(scale.ticks).not.toContain(0)
    for (const tick of scale.ticks) {
      expect(Math.abs(tick % scale.step)).toBeLessThan(1e-6)
    }
  })

  it("gives a single data-baseline measurement a band to sit in", () => {
    // Not a zero-span domain: one weigh-in must still draw an axis and a point.
    const scale = niceScale(182.4, 182.4, 4, "data")
    expect(scale.min).toBeLessThan(182.4)
    expect(scale.max).toBeGreaterThan(182.4)
    expect(scale.ticks.length).toBeGreaterThan(1)
  })

  it("keeps zero-baseline behaviour untouched by the new argument", () => {
    // The money charts must not shift: same call, same numbers as before.
    expect(niceScale(500, 900, 4, "zero")).toEqual(niceScale(500, 900))
    expect(niceScale(0, 0, 4, "zero")).toEqual({
      min: 0,
      max: 1,
      step: 1,
      ticks: [0, 1],
    })
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

describe("ringArc", () => {
  it("hides the whole ring at 0% and none of it at 100%", () => {
    const empty = ringArc(0)
    const full = ringArc(100)
    expect(empty.dashOffset).toBeCloseTo(empty.circumference, 1)
    expect(full.dashOffset).toBe(0)
  })

  it("offsets by the unfilled share", () => {
    const ring = ringArc(25)
    expect(ring.dashOffset).toBeCloseTo(ring.circumference * 0.75, 1)
  })

  // A rate can only reach 100 today, but the ring is a general primitive and a dash
  // offset past the circumference wraps around and reads as a small partial fill.
  it("clamps out-of-range percentages instead of wrapping", () => {
    expect(ringArc(140).dashOffset).toBe(0)
    expect(ringArc(-20).dashOffset).toBeCloseTo(ringArc(0).circumference, 1)
  })

  it("sizes the box to fit the stroke, not just the radius", () => {
    const ring = ringArc(50, 28, 6)
    // Radius plus half the stroke on each side, or the ring clips at the edges.
    expect(ring.size).toBe(62)
    expect(ring.center).toBe(31)
  })

  it("derives the circumference from the radius", () => {
    expect(ringArc(50, 10).circumference).toBeCloseTo(2 * Math.PI * 10, 1)
  })
})
