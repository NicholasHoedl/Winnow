import { describe, expect, it } from "vitest"

import {
  isMoreActive,
  navItems,
  phoneMore,
  phoneTabs,
  SETTINGS_ITEM,
} from "./nav-items"

// The phone's navigation is derived from the one list the sidebar reads (T35, ADR-0029).
// These pin the derivation rather than a copy of it: a destination added to `navItems`
// without a phone placement, or given two, fails here before it can go missing from a
// phone or turn up twice on one.

describe("the phone navigation", () => {
  it("puts every destination in exactly one place, the tab bar or More", () => {
    const placed = [...phoneTabs, ...phoneMore].map((item) => item.href)
    for (const item of navItems) {
      expect(
        placed.filter((href) => href === item.href),
        `${item.label} should appear exactly once`,
      ).toHaveLength(1)
    }
    expect(new Set(placed).size).toBe(placed.length)
  })

  it("gives the tab bar the four daily destinations, in the sidebar's order", () => {
    expect(phoneTabs.map((item) => item.label)).toEqual([
      "Dashboard",
      "Activity",
      "Budget",
      "Meals",
    ])
  })

  it("never gives the bar more than five slots, More included", () => {
    // Material's navigation bar is for three to five destinations, and Apple's tab bar
    // guidance is the same; past five, both hand the rest to a menu.
    expect(phoneTabs.length + 1).toBeLessThanOrEqual(5)
  })

  it("puts the weekly destinations and Settings under More", () => {
    expect(phoneMore.map((item) => item.label)).toEqual([
      "Goals",
      "Calendar",
      "Review",
      "Settings",
    ])
    expect(phoneMore.at(-1)).toBe(SETTINGS_ITEM)
  })

  it("leaves the sidebar's seven destinations as they were", () => {
    expect(navItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Activity",
      "Goals",
      "Calendar",
      "Budget",
      "Meals",
      "Review",
    ])
  })

  it("lights More on every page it holds, and on no other", () => {
    for (const path of [
      "/goals",
      "/calendar",
      "/review",
      "/settings",
      "/settings/region",
    ])
      expect(isMoreActive(path), path).toBe(true)
    for (const path of [
      "/",
      "/activity",
      "/activity/habits",
      "/budget",
      "/budget/trends",
      "/meals",
    ])
      expect(isMoreActive(path), path).toBe(false)
  })
})
