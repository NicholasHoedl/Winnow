import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { MealEntry } from "@/modules/meals/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { MealsView } from "./meals-view"

// `"use server"` — importing for real drags in the database, the same treatment
// `log-food-dialog.test.tsx` gives it. The list is long because this renders the whole
// page: it is the union of what the view and every strip, card and dialog under it
// imports. Nothing here is called by a render that only reads the order of the page.
vi.mock("@/modules/meals/actions", () => ({
  copyDay: vi.fn(),
  createFood: vi.fn(),
  deleteBodyWeight: vi.fn(),
  deleteFood: vi.fn(),
  deleteMacroTargetPeriod: vi.fn(),
  deleteMealEntries: vi.fn(),
  deleteMealEntry: vi.fn(),
  deleteSavedMeal: vi.fn(),
  deleteWaterLog: vi.fn(),
  logMeal: vi.fn(),
  logReferenceFood: vi.fn(),
  logSavedMeal: vi.fn(),
  logWater: vi.fn(),
  lookupBarcode: vi.fn(),
  restoreFood: vi.fn(),
  restoreMacroTargetPeriod: vi.fn(),
  restoreMealEntry: vi.fn(),
  restoreSavedMeal: vi.fn(),
  restoreWaterLog: vi.fn(),
  saveSavedMeal: vi.fn(),
  searchFoodDatabase: vi.fn(),
  searchReferenceFoods: vi.fn(),
  setBodyWeight: vi.fn(),
  setMacroTargets: vi.fn(),
  updateFood: vi.fn(),
  updateMealEntry: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

// `DateJumpButton` calls `useRouter` while it renders, and outside Next's app router that
// throws. Nothing here navigates; the button only has to be on the page.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

/** Only the columns the view reads — see the note in `log-food-dialog.test.tsx`. */
function entry(over: Record<string, unknown> = {}): MealEntry {
  return {
    id: "entry-1",
    date: "2026-09-11",
    foodId: null,
    name: "Porridge",
    servingLabel: "1 bowl",
    calories: 250,
    proteinG: 8,
    carbsG: 40,
    fatG: 5,
    fiberG: null,
    sugarG: null,
    satFatG: null,
    sodiumMg: null,
    servings: 1,
    mealType: "breakfast",
    ...over,
  } as unknown as MealEntry
}

/**
 * The trend as the page passes it: a server-rendered node, so this file stands in for it
 * with the one thing the order is read by — the `h2` `DashboardCard` gives it.
 */
const TREND = <h2>Weight trend</h2>

function show(entries: MealEntry[]) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <MealsView
        date="2026-09-11"
        today="2026-09-11"
        entries={entries}
        foods={[]}
        targets={null}
        targetHistory={[]}
        quickPicks={[]}
        savedMeals={[]}
        waterLogs={[]}
        trackWeight
        weight={null}
        weightReadout={null}
        weightTrend={TREND}
        offEnabled={false}
      />
    </PreferencesProvider>,
  )
}

describe("MealsView", () => {
  it("puts the day's log above the weight trend", () => {
    show([entry()])

    // Every heading the page draws, in the order it draws them: the title, the log's one
    // meal section, then the trend. The log is what the page is for and the trend is the
    // least-used thing on it, so the trend closes the page rather than pushing the log
    // below a screenful of everything else.
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Meals",
      "Breakfast",
      "Weight trend",
    ])
  })

  it("keeps the trend below an empty day's log", () => {
    show([])

    const empty = screen.getByText("Nothing logged for this day.")
    const trend = screen.getByRole("heading", { name: "Weight trend" })
    expect(
      empty.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
