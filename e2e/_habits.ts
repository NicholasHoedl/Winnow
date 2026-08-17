import { type Locator } from "@playwright/test"

/**
 * Reading a habit's quota off its meter.
 *
 * Shared because the quota is drawn on three surfaces — the dashboard card, `/activity`'s
 * strip and `/activity/habits` — and two spec files assert on it. One copy means the next
 * change to how a quota is drawn costs one edit here rather than fifteen scattered ones,
 * which is the same reasoning that produced `_goals.ts`.
 *
 * These read `aria-valuetext` rather than visible text because the visible "2/3 this week"
 * is GONE: a quota is drawn as one box per log you owe, and countable boxes make the
 * numbers redundant. That leaves the meter as the only thing carrying the count, so
 * asserting on what it announces tests the number and its accessibility together — a text
 * assertion cannot, because there is no text left to match.
 */

/** The quota meter inside `scope`, named for its habit so a page of many stays unambiguous. */
export function meter(scope: Locator, title: string): Locator {
  return scope.getByRole("progressbar", { name: title })
}

/** "2 of 3 this week" — the shape `QuotaMeter` builds for `aria-valuetext`. */
export function announces(
  done: number,
  target: number,
  period: string,
): string {
  return `${done} of ${target} ${period}`
}
