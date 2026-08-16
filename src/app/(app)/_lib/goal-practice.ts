// Pure grouping for the dashboard's "Goals & practice" card: each goal with the habits that
// serve it, and the habits that serve none of them last. Dependency-free (no DB, no
// `server-only`) so it unit-tests directly — same conventions as `agenda.ts` beside it.

/** The only fields the grouping reads off a goal; callers pass their richer rows. */
export type PracticeGoal = { id: string }

/** The only field it reads off a habit. See `habits.goal_id`. */
export type PracticeHabit = { goalId: string | null }

export type PracticeGroup<G, H> = {
  /**
   * The goal these habits serve, or **null** for the group that serves none.
   *
   * Null rather than a sentinel goal so the renderer's branch is a type narrowing rather
   * than a magic id comparison — a heading and a list of habits is genuinely a different
   * shape from a goal with progress and a bar.
   */
  goal: G | null
  habits: H[]
}

/**
 * Habits grouped under the goal each one serves.
 *
 * **Goal order, not first-appearance order.** `buildTodayAgenda` next door groups routines in
 * the order their first task appears, because a routine has no independent position. A goal
 * does — `[sortOrder, createdAt]`, which a drag on `/goals` writes — so the groups follow the
 * goals array and a goal with no habits at all still gets its place in it. That is deliberate:
 * this is a goals card that shows practice, not a habits card that mentions goals.
 *
 * The goal-less group is emitted **last**, and only when it has members, matching
 * `groupByMealType`'s "other" bucket.
 *
 * A habit whose `goalId` names a goal that is not in `goals` falls into the goal-less group
 * rather than vanishing — the same degradation the agenda applies to a routine it cannot name.
 * Worth stating because it is reachable rather than theoretical: `getGoals` returns every goal
 * a user has, so in practice this catches a caller that filtered them.
 */
export function groupPracticeByGoal<
  G extends PracticeGoal,
  H extends PracticeHabit,
>(goals: readonly G[], habits: readonly H[]): PracticeGroup<G, H>[] {
  const known = new Set(goals.map((goal) => goal.id))
  const groups: PracticeGroup<G, H>[] = goals.map((goal) => ({
    goal,
    habits: habits.filter((habit) => habit.goalId === goal.id),
  }))

  const loose = habits.filter(
    (habit) => habit.goalId === null || !known.has(habit.goalId),
  )
  if (loose.length > 0) groups.push({ goal: null, habits: loose })

  return groups
}
