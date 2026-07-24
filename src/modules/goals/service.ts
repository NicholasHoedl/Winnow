// Pure goal-progress logic. No DB, no framework — unit-testable directly.

export function goalProgress(
  milestones: { done: boolean }[],
): { done: number; total: number; percent: number } {
  const total = milestones.length
  const done = milestones.filter((mile) => mile.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}
