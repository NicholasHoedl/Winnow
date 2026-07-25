// Pure chart geometry. No React, no DOM, no measurement — the charts are server
// components that scale via the SVG viewBox, so every coordinate here is in the
// chart's own units and needs no knowledge of the rendered pixel size.

export type Scale = {
  min: number
  max: number
  step: number
  /** Tick values from min to max inclusive. */
  ticks: number[]
}

export type Point = { x: number; y: number }

/** Round a range up to a 1/2/5 × 10ⁿ "nice" magnitude. */
function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let nice: number
  if (round) {
    if (fraction < 1.5) nice = 1
    else if (fraction < 3) nice = 2
    else if (fraction < 7) nice = 5
    else nice = 10
  } else {
    if (fraction <= 1) nice = 1
    else if (fraction <= 2) nice = 2
    else if (fraction <= 5) nice = 5
    else nice = 10
  }
  return nice * 10 ** exponent
}

/**
 * A rounded axis domain plus its tick values.
 *
 * The domain always includes zero — these are money charts, where bars grow from a
 * zero baseline and a net line legitimately crosses below it. An all-zero series
 * yields a 0..1 placeholder domain so the axis still renders instead of dividing by
 * a zero span.
 */
export function niceScale(min: number, max: number, targetTicks = 4): Scale {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)

  if (lo === hi) return { min: 0, max: 1, step: 1, ticks: [0, 1] }

  const step = niceNum(
    niceNum(hi - lo, false) / Math.max(1, targetTicks - 1),
    true,
  )
  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step

  const ticks: number[] = []
  // The half-step slack absorbs float drift so the top tick isn't dropped.
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6)
  }
  return { min: niceMin, max: niceMax, step, ticks }
}

/** A value's y coordinate, with 0 at the top of the box (SVG's direction). */
export function scaleY(value: number, scale: Scale, height: number): number {
  const span = scale.max - scale.min || 1
  return height - ((value - scale.min) / span) * height
}

/** Evenly spaced slots across `width`, each holding a centred bar. */
export function barLayout(
  count: number,
  width: number,
  gapRatio = 0.32,
): { x: number; width: number }[] {
  if (count <= 0) return []
  const slot = width / count
  const barWidth = Math.max(1, slot * (1 - gapRatio))
  return Array.from({ length: count }, (_, index) => ({
    x: index * slot + (slot - barWidth) / 2,
    width: barWidth,
  }))
}

/** Centre of slot `index` — where a line/point sits above a bar. */
export function slotCenter(
  index: number,
  count: number,
  width: number,
): number {
  if (count <= 0) return 0
  const slot = width / count
  return index * slot + slot / 2
}

/** An open polyline through the points. Empty for no points. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return ""
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ")
}

/** The line closed down to `baselineY` — a filled area under the curve. */
export function areaPath(points: Point[], baselineY: number): string {
  if (points.length === 0) return ""
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)} L${round(last.x)} ${round(baselineY)} L${round(first.x)} ${round(baselineY)} Z`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
