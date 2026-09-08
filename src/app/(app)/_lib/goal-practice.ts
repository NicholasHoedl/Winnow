// Pure grouping for the dashboard's practice card: habits under the cadence they are kept
// at. Dependency-free (no DB, no `server-only`) so it unit-tests directly — same
// conventions as `agenda.ts` beside it.

/** The cadences a habit can be kept at, in the order they are shown. */
export const PRACTICE_PERIODS = ["day", "week", "month"] as const
export type PracticePeriod = (typeof PRACTICE_PERIODS)[number]

/** The only field the grouping reads off a habit. See `habits.period`. */
export type PracticeHabit = { period: PracticePeriod }

export type PracticeGroup<H> = {
  period: PracticePeriod
  habits: H[]
}

/**
 * Habits grouped by how often they are kept — everything daily, then weekly, then monthly.
 *
 * **This replaced a grouping by GOAL, and the inversion is the point.** The card used to
 * read as a goals card that showed practice: a heading per goal, its habits indented
 * beneath, and the goal-less ones in a trailing bucket. Reported from real use — with four
 * or five goals that arrangement answers "what is this for" at the cost of the question you
 * open a dashboard to ask, which is what you have to do today. Cadence answers that
 * directly, and the goal survives as an annotation on the row.
 *
 * Two consequences worth stating, because both were deliberate before and are gone now:
 *
 * - **A goal with no habits has nothing to render.** The old grouping emitted a group per
 *   goal whether or not it had practice, so an unplanned goal still had a place on the
 *   dashboard. Nothing here can do that — there is no habit to hang it on — and the card
 *   no longer shows goals in their own right, so it does not try.
 * - **A habit whose goal is unknown is no longer separated out.** It was a trailing "not
 *   tied to a goal" group; it now sits in its cadence like any other, with no annotation.
 *   The renderer looks the goal up by id and draws nothing when it cannot find one, which
 *   also covers the id that names a goal the caller filtered out.
 *
 * Fixed period order rather than first-appearance order: a cadence is a fact about time,
 * not a position anyone chose, so there is nothing here to preserve the way `goals`
 * carried a `sortOrder`. Order WITHIN a group is the caller's, untouched.
 *
 * A cadence with no habits is omitted entirely — a heading over nothing is dead space on a
 * card that already runs tight below 1400px.
 */
export function groupPracticeByPeriod<H extends PracticeHabit>(
  habits: readonly H[],
): PracticeGroup<H>[] {
  return PRACTICE_PERIODS.map((period) => ({
    period,
    habits: habits.filter((habit) => habit.period === period),
  })).filter((group) => group.habits.length > 0)
}
