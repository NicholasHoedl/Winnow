// Pure time-grid geometry for the week/day calendar views. No React, no DOM, no
// measurement — every coordinate here is a FRACTION of the column it sits in, so the
// view sizes itself with CSS and this file needs no knowledge of pixels. Same contract
// as `charts/geometry.ts`.
//
// The vertical axis is WALL CLOCK: 24 fixed hour rows, shared by every column. That is
// a deliberate choice about DST rather than an oversight. A local day is sometimes 23
// or 25 hours long, and positioning by real elapsed time would put 09:00 on a
// spring-forward Sunday an hour above 09:00 in the six columns beside it — the one
// comparison a week view exists to support. The rest of the app models events the same
// way (`calendar/service.ts`: occurrences use a wall-clock model), so the grid agrees
// with the data it draws.
//
// What DST costs is then confined to the labels, and {@link dstNotes} reports it: on a
// spring-forward day one row is an hour that never happens, and on a fall-back day one
// row is an hour that happens twice. The view marks the first and lets the second
// collapse into its single row — which is all the data model can express anyway, since
// `zonedDateTimeToUtc` resolves an ambiguous wall clock to the earlier instant.

import { addDays } from "@/lib/date"
import { localDateTime, zonedDateTimeToUtc } from "@/modules/calendar/service"

/** The axis, in minutes. Always a plain 24 hours — see the note above. */
export const DAY_MINUTES = 24 * 60

/** The rows: hours 0..23. */
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** How long an occurrence with no end time is drawn for. `events.end_at` is nullable,
 *  so an occurrence can have no intrinsic height at all; it still has to be visible
 *  and hittable, and half an hour is the shortest block a title fits in. */
export const DEFAULT_MINUTES = 30

/** Floor for anything shorter — a zero-length event, or one whose end is at or before
 *  its start. Thinner than this and the block cannot be tapped. */
export const MIN_MINUTES = 15

/** Wall-clock "HH:MM" as minutes past midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** A block's vertical extent within one column, in minutes past midnight. */
export type Span = { start: number; end: number }

/**
 * The part of an occurrence belonging in `date`'s column, clamped to it.
 *
 * Null for an all-day occurrence — those belong in the gutter above the grid — and for
 * one that does not touch this day at all.
 *
 * A multi-day span has to be clamped by the column itself: `bucketByDay` puts the SAME
 * occurrence object into every day it covers, so a column cannot read a start and an
 * end off it and must work out which part is its own.
 */
export function daySpan(
  occ: {
    date: string
    endDate: string
    time: string | null
    endTime: string | null
  },
  date: string,
): Span | null {
  if (occ.time === null) return null
  if (occ.date > date || occ.endDate < date) return null

  // Started on an earlier day → this column picks it up at midnight.
  const start = occ.date === date ? minutesOf(occ.time) : 0
  // Ends on a later day → it runs off the bottom. An occurrence can only lack an
  // endTime when it also ends on its start day, so the fallback is safe here.
  const end =
    occ.endDate !== date
      ? DAY_MINUTES
      : occ.endTime
        ? minutesOf(occ.endTime)
        : start + DEFAULT_MINUTES

  let lo = Math.max(0, Math.min(start, DAY_MINUTES))
  const hi = Math.min(DAY_MINUTES, Math.max(end, lo + MIN_MINUTES))
  // A block starting in the last minutes of the day would otherwise be clipped to
  // nothing; slide it up so it keeps its minimum height instead of vanishing.
  if (hi - lo < MIN_MINUTES) lo = Math.max(0, hi - MIN_MINUTES)
  return { start: lo, end: hi }
}

/** A span as fractions of the column: 0 is the top edge, 1 the bottom. */
export function spanFractions(span: Span): { top: number; height: number } {
  return {
    top: span.start / DAY_MINUTES,
    height: (span.end - span.start) / DAY_MINUTES,
  }
}

/** What DST does to one day's rows. Both lists are empty on an ordinary day. */
export type DstNotes = {
  /** Wall-clock hours that never happen — the clock springs over them. */
  skipped: number[]
  /** Wall-clock hours the clock passes through twice. */
  repeated: number[]
}

/**
 * Which rows of `date`'s column are unusual in `tz`.
 *
 * Derived by walking real time forward from local midnight and seeing which wall-clock
 * hours turn up, rather than from a table of when each zone shifts — so it is right for
 * southern-hemisphere zones, for zones that shift on other dates, and for zones that
 * don't shift at all, without knowing anything about any of them.
 *
 * Zones shifting by something other than a whole hour (Lord Howe Island moves 30
 * minutes, and is the only one) fall outside what an hour-row grid can express. The
 * walk still terminates and the grid still renders; the annotation is just approximate.
 */
export function dstNotes(date: string, tz: string): DstNotes {
  const midnight = zonedDateTimeToUtc(date, "00:00", tz)
  const next = zonedDateTimeToUtc(addDays(date, 1), "00:00", tz)
  const minutes = Math.round((next.getTime() - midnight.getTime()) / 60_000)
  if (minutes === DAY_MINUTES) return { skipped: [], repeated: [] }

  const counts = new Map<number, number>()
  for (let minute = 0; minute < minutes; minute += 60) {
    const at = new Date(midnight.getTime() + minute * 60_000)
    const hour = Number(localDateTime(at, tz).time.slice(0, 2))
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
  }
  return {
    skipped: HOURS.filter((hour) => !counts.has(hour)),
    repeated: HOURS.filter((hour) => (counts.get(hour) ?? 0) > 1),
  }
}

/** A block's horizontal placement within its column, as fractions of the width. */
export type Lane = { left: number; width: number }

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Side-by-side placement for spans that overlap in time. Returns one {@link Lane} per
 * input span, in input order.
 *
 * Spans are grouped into clusters — runs where each overlaps at least one other,
 * directly or transitively — and columns are assigned greedily within each cluster.
 * Clustering is what keeps a busy morning from squeezing an otherwise-alone afternoon
 * event: three overlapping at 09:00 get thirds, a lone 15:00 still gets the full width.
 *
 * A block then widens rightwards across any adjacent column holding nothing that
 * conflicts with it. Without that step a cluster's widest point permanently narrows
 * every block in it, and a day with one three-way clash at lunch renders every other
 * event that touches it at a third of the width for no visible reason.
 *
 * Spans that merely touch (one ends exactly where the next starts) do not overlap.
 */
export function layoutLanes(spans: Span[]): Lane[] {
  const lanes: Lane[] = new Array(spans.length)
  // Longest-first among equal starts, so the block most likely to collide claims the
  // leftmost column and the short ones stack to its right.
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort(
      (a, b) =>
        a.span.start - b.span.start ||
        b.span.end - a.span.end ||
        a.index - b.index,
    )

  let cluster: { span: Span; index: number; column: number }[] = []
  let columnEnds: number[] = []

  function flush() {
    const count = columnEnds.length || 1
    for (const item of cluster) {
      let width = 1
      while (
        item.column + width < count &&
        !cluster.some(
          (other) =>
            other.column === item.column + width &&
            overlaps(other.span, item.span),
        )
      ) {
        width++
      }
      lanes[item.index] = { left: item.column / count, width: width / count }
    }
    cluster = []
    columnEnds = []
  }

  for (const item of order) {
    // Nothing already placed is still running → the cluster is closed. Starts are
    // non-decreasing and a column's blocks never overlap, so each columnEnds entry is
    // that column's latest end.
    if (
      columnEnds.length > 0 &&
      columnEnds.every((end) => end <= item.span.start)
    ) {
      flush()
    }
    let column = columnEnds.findIndex((end) => end <= item.span.start)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = item.span.end
    cluster.push({ span: item.span, index: item.index, column })
  }
  flush()

  return lanes
}
