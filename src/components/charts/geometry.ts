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

/** Where the axis starts. See {@link niceScale}. */
export type Baseline = "zero" | "data"

/**
 * A rounded axis domain plus its tick values.
 *
 * `baseline: "zero"` (the default) forces zero into the domain, which is what money
 * charts want: bars grow from a real baseline and a net line legitimately crosses
 * below it. An all-zero series yields a 0..1 placeholder domain so the axis still
 * renders instead of dividing by a zero span.
 *
 * `baseline: "data"` fits the domain to the values instead. Some quantities never go
 * near zero and are read as *changes*: a body weight moving 181 → 184 lb is invisible
 * on a 0–200 axis, where every point lands inside the top 2% of the plot. Forcing zero
 * there doesn't make the chart honest, it makes it unreadable.
 */
export function niceScale(
  min: number,
  max: number,
  targetTicks = 4,
  baseline: Baseline = "zero",
): Scale {
  const zeroed = baseline === "zero"
  const lo = zeroed ? Math.min(0, min) : min
  const hi = zeroed ? Math.max(0, max) : max

  if (lo === hi) {
    if (zeroed) return { min: 0, max: 1, step: 1, ticks: [0, 1] }
    // A single measurement still deserves a readable axis, so give it a band to sit
    // in the middle of rather than collapsing the domain to a point.
    const pad = Math.max(1, Math.abs(lo) * 0.01)
    return niceScale(lo - pad, hi + pad, targetTicks, "data")
  }

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

export type Ring = {
  /** Square viewBox side that fits the ring including its stroke. */
  size: number
  /** Centre of that box, on both axes. */
  center: number
  /** Radius of the stroke's centre line. */
  radius: number
  circumference: number
  /** `stroke-dashoffset` for the filled arc — the rest of the ring stays as track. */
  dashOffset: number
}

/**
 * A progress ring, expressed as a dash offset rather than an arc path.
 *
 * A stroked `<circle>` with `stroke-dasharray: circumference` draws the whole ring; the
 * offset hides the unfilled part. That beats generating an arc `d` because it needs no
 * large-arc/sweep flag handling, degenerates cleanly at 0% and 100% (an arc path for a
 * full circle collapses to a point), and animates by interpolating one number.
 *
 * The caller still has to rotate the circle -90° for the fill to start at twelve o'clock;
 * that is a render concern, not a geometric one.
 */
export function ringArc(percent: number, radius = 28, strokeWidth = 6): Ring {
  // Clamped rather than trusted: a rate of 0 makes an empty ring, and anything past 100
  // would wrap the dash back around and read as a partial fill.
  const clamped = Math.min(100, Math.max(0, percent))
  const circumference = 2 * Math.PI * radius
  const size = (radius + strokeWidth / 2) * 2
  return {
    size: round(size),
    center: round(size / 2),
    radius: round(radius),
    circumference: round(circumference),
    dashOffset: round(circumference * (1 - clamped / 100)),
  }
}
