// Pure daily-digest assembly. Dependency-free (no DB, no `server-only`) so it
// unit-tests directly and the client banner can import its types.

/** Only the fields the digest reads; callers pass their richer objects. */
export type DigestTasks = { overdueCount: number; dueTodayCount: number }
export type DigestOccurrence = { time: string | null; event: { title: string } }
export type DigestMacroSet = {
  calories: { remaining: number | null }
  protein: { remaining: number | null }
  carbs: { remaining: number | null }
  fat: { remaining: number | null }
}

export type DigestEvent = { title: string; time: string | null }
export type DigestMacro = { label: string; remaining: number; unit: string }

export type Digest = {
  overdueCount: number
  dueTodayCount: number
  events: DigestEvent[]
  /** Targets with something still left on them. Context only — see `buildDigest`. */
  unmetMacros: DigestMacro[]
}

const MACROS = [
  { key: "calories", label: "calories", unit: "kcal" },
  { key: "protein", label: "protein", unit: "g" },
  { key: "carbs", label: "carbs", unit: "g" },
  { key: "fat", label: "fat", unit: "g" },
] as const

/**
 * Assemble the day's digest.
 *
 * Returns `null` when there's nothing worth interrupting for. Note that unmet macro
 * targets alone do NOT qualify: first thing every morning nothing has been eaten, so
 * every target is "unmet" — triggering on that would nag daily with nothing
 * actionable. Macros ride along as context when tasks or events already warrant it.
 */
export function buildDigest(
  tasks: DigestTasks,
  occurrences: DigestOccurrence[],
  macros: DigestMacroSet | null,
): Digest | null {
  const hasTasks = tasks.overdueCount > 0 || tasks.dueTodayCount > 0
  if (!hasTasks && occurrences.length === 0) return null

  const unmetMacros: DigestMacro[] = []
  if (macros) {
    for (const { key, label, unit } of MACROS) {
      const remaining = macros[key].remaining
      if (remaining != null && remaining > 0) {
        unmetMacros.push({ label, remaining: Math.round(remaining), unit })
      }
    }
  }

  return {
    overdueCount: tasks.overdueCount,
    dueTodayCount: tasks.dueTodayCount,
    events: occurrences.map((o) => ({ title: o.event.title, time: o.time })),
    unmetMacros,
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One-line summary of what the day holds, e.g. "2 tasks and 1 event". */
export function digestHeadline(digest: Digest): string {
  const taskCount = digest.overdueCount + digest.dueTodayCount
  const parts: string[] = []
  if (taskCount > 0) parts.push(plural(taskCount, "task", "tasks"))
  if (digest.events.length > 0) {
    parts.push(plural(digest.events.length, "event", "events"))
  }
  if (parts.length === 0) return "Nothing pressing today"
  return `${parts.join(" and ")} today`
}
