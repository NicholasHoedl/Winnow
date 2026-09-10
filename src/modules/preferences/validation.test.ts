import { describe, expect, it } from "vitest"

import {
  appearancePreferencesSchema,
  defaultPreferencesSchema,
  notificationPreferencesSchema,
  regionPreferencesSchema,
  userPreferencesSchema,
} from "./validation"

/**
 * The fifteen preference fields, split across two settings pages.
 *
 * Each page's form submits only its own schema, and each action writes exactly the keys
 * that schema parses. That is what stops one page clobbering the other — and it is also
 * what makes a field that lands in NEITHER schema fail silently: the form would not render
 * it, the action would not write it, and nothing on screen would say the setting had
 * stopped being saveable. The list below is the contract, written out rather than derived,
 * so that dropping a field from a schema fails here rather than in someone's settings.
 */
const REGION = [
  "timeZone",
  "weekStartsOn",
  "currency",
  "use24HourTime",
  "dateFormat",
  "weightUnit",
  "volumeUnit",
] as const

const DEFAULTS = [
  "defaultTaskPriority",
  "goalMomentumDays",
  "balanceMacroTargets",
  "defaultCalendarView",
  "slateHorizonDays",
  "dashboardCalendarView",
  "landingPage",
  "defaultMealType",
  "defaultListId",
  "trackWeight",
  "goalWeightLb",
] as const

const keys = (schema: { shape: object }) => Object.keys(schema.shape).sort()

describe("preference schemas", () => {
  it("region owns exactly the formatting fields", () => {
    expect(keys(regionPreferencesSchema)).toEqual([...REGION].sort())
  })

  it("defaults owns exactly the behaviour fields", () => {
    expect(keys(defaultPreferencesSchema)).toEqual([...DEFAULTS].sort())
  })

  it("the two partition the whole", () => {
    // Disjoint, and together they are the composed schema — no field in both, none lost.
    const overlap = REGION.filter((k) =>
      (DEFAULTS as readonly string[]).includes(k),
    )
    expect(overlap).toEqual([])
    expect(keys(userPreferencesSchema)).toEqual([...REGION, ...DEFAULTS].sort())
  })

  it("leaves the fields other sections own to those sections", () => {
    // Ownership rules the validation file documents. `dashboardCollapsed` has no form at
    // all — the card chevron is its only writer — and the other two have pages of their own.
    for (const schema of [regionPreferencesSchema, defaultPreferencesSchema]) {
      expect(keys(schema)).not.toContain("dashboardCollapsed")
      expect(keys(schema)).not.toContain("digestEnabled")
      expect(keys(schema)).not.toContain("theme")
    }
    expect(keys(notificationPreferencesSchema)).toEqual(["digestEnabled"])
    expect(keys(appearancePreferencesSchema)).toEqual(["theme"])
  })
})
