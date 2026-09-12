import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { logMeal, updateMealEntry } from "@/modules/meals/actions"
import type { MealEntry } from "@/modules/meals/queries"
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { LogFoodDialog } from "./log-food-dialog"

// `"use server"` — importing for real drags in the database. Same treatment as
// `transaction-dialog.test.tsx`: only the return value matters, and what this file is
// about is the values the dialog OPENS with and what it sends.
vi.mock("@/modules/meals/actions", () => ({
  logMeal: vi.fn(),
  lookupBarcode: vi.fn(),
  updateMealEntry: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/** Only the columns the dialog reads — see the note in `transaction-dialog.test.tsx`. */
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
    mealType: null,
    ...over,
  } as unknown as MealEntry
}

function show(
  props: Partial<React.ComponentProps<typeof LogFoodDialog>> = {},
  preferences: Partial<UserPreferences> = {},
) {
  return render(
    <PreferencesProvider value={{ ...DEFAULT_PREFERENCES, ...preferences }}>
      <LogFoodDialog
        date="2026-09-11"
        foods={[]}
        quickPicks={[]}
        entry={null}
        offEnabled={false}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * What the dialog assumes before you touch it.
 *
 * Unit rather than e2e because these are opening values: a browser journey would have to
 * change the preference in Settings and come back for each one, and the assertion at the
 * end is still just "what does this control say".
 */
describe("LogFoodDialog", () => {
  beforeEach(() => {
    vi.mocked(logMeal).mockReset()
    vi.mocked(updateMealEntry).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  // The quick-add bar and the saved meals already honour this preference; the dialog was
  // the one way in that ignored it, so anything logged here landed under "No meal".
  it("opens a new entry on the meal the preference names", () => {
    show({}, { defaultMealType: "lunch" })
    expect(screen.getByLabelText("Meal")).toHaveTextContent("Lunch")
  })

  it("logs it under that meal", async () => {
    vi.mocked(logMeal).mockResolvedValue({ ok: true })
    show({}, { defaultMealType: "lunch" })

    fireEvent.change(screen.getByLabelText("Food"), {
      target: { value: "Porridge" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Log" }))

    await waitFor(() => expect(logMeal).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logMeal).mock.calls[0][0]).toMatchObject({
      mealType: "lunch",
    })
  })

  // No preference means what it always did: nothing is assumed, and "No meal" is still
  // a choice the user can make with the preference set.
  it("leaves the meal unset when there is no preference", () => {
    show({}, { defaultMealType: null })
    expect(screen.getByLabelText("Meal")).toHaveTextContent("No meal")
  })

  it("keeps the entry's own meal when editing, preference or not", () => {
    show({ entry: entry({ mealType: null }) }, { defaultMealType: "lunch" })
    expect(screen.getByLabelText("Meal")).toHaveTextContent("No meal")
  })

  // What the quick-add parser has always written for a hand-entered food. An empty
  // serving is not a fact about the food, and the field is required, so a blank one only
  // ever bought a validation error.
  it("starts a hand-entered food at one serving", () => {
    show()
    expect(screen.getByLabelText("Serving")).toHaveValue("1 serving")
  })
})
