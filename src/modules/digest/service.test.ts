import { describe, expect, it } from "vitest"

import { buildDigest, digestHeadline, type DigestMacroSet } from "./service"

const NO_TASKS = { overdueCount: 0, dueTodayCount: 0 }

function occ(title: string, time: string | null = "09:00") {
  return { time, event: { title } }
}

// Every target still fully open — what the morning always looks like.
const ALL_UNMET: DigestMacroSet = {
  calories: { remaining: 2000 },
  protein: { remaining: 150 },
  carbs: { remaining: 200 },
  fat: { remaining: 60 },
}

describe("buildDigest", () => {
  it("returns null when there are no tasks and no events", () => {
    expect(buildDigest(NO_TASKS, [], null)).toBeNull()
  })

  it("does not fire on unmet macros alone", () => {
    // Otherwise the banner would nag every single morning, before any meal is
    // logged, with nothing the user can act on.
    expect(buildDigest(NO_TASKS, [], ALL_UNMET)).toBeNull()
  })

  it("fires on tasks alone", () => {
    const digest = buildDigest({ overdueCount: 2, dueTodayCount: 0 }, [], null)
    expect(digest).not.toBeNull()
    expect(digest!.overdueCount).toBe(2)
    expect(digest!.events).toEqual([])
  })

  it("fires on events alone and carries their titles and times", () => {
    const digest = buildDigest(
      NO_TASKS,
      [occ("Standup", "09:00"), occ("Picnic", null)],
      null,
    )
    expect(digest!.events).toEqual([
      { title: "Standup", time: "09:00" },
      { title: "Picnic", time: null },
    ])
  })

  it("includes unmet macros as context once something else warrants the digest", () => {
    const digest = buildDigest(
      { overdueCount: 1, dueTodayCount: 0 },
      [],
      ALL_UNMET,
    )
    expect(digest!.unmetMacros.map((m) => m.label)).toEqual([
      "calories",
      "protein",
      "carbs",
      "fat",
    ])
    expect(digest!.unmetMacros[0]).toEqual({
      label: "calories",
      remaining: 2000,
      unit: "kcal",
    })
  })

  it("omits macros that are met, have no target, or are already exceeded", () => {
    const macros: DigestMacroSet = {
      calories: { remaining: 0 }, // exactly met
      protein: { remaining: null }, // no target set
      carbs: { remaining: -25 }, // over
      fat: { remaining: 12.4 }, // still open, rounds
    }
    const digest = buildDigest(
      { overdueCount: 1, dueTodayCount: 0 },
      [],
      macros,
    )
    expect(digest!.unmetMacros).toEqual([
      { label: "fat", remaining: 12, unit: "g" },
    ])
  })
})

describe("digestHeadline", () => {
  it("counts overdue and due-today together, and pluralises", () => {
    const one = buildDigest({ overdueCount: 1, dueTodayCount: 0 }, [], null)!
    expect(digestHeadline(one)).toBe("1 task today")

    const many = buildDigest({ overdueCount: 2, dueTodayCount: 3 }, [], null)!
    expect(digestHeadline(many)).toBe("5 tasks today")
  })

  it("joins tasks and events", () => {
    const digest = buildDigest(
      { overdueCount: 1, dueTodayCount: 1 },
      [occ("Standup")],
      null,
    )!
    expect(digestHeadline(digest)).toBe("2 tasks and 1 event today")
  })

  it("reports events on their own", () => {
    const digest = buildDigest(NO_TASKS, [occ("A"), occ("B")], null)!
    expect(digestHeadline(digest)).toBe("2 events today")
  })
})
