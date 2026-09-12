import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { logMeal } from "@/modules/meals/actions"
import type { QuickPickFood } from "@/modules/meals/service"
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { QuickPickStrip } from "./quick-pick-strip"

vi.mock("@/modules/meals/actions", () => ({ logMeal: vi.fn() }))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

const PICK: QuickPickFood = {
  key: "banana",
  foodId: null,
  name: "Banana",
  servingLabel: "1 medium",
  calories: 105,
  proteinG: 1,
  carbsG: 27,
  fatG: 0,
  fiberG: null,
  sugarG: null,
  satFatG: null,
  sodiumMg: null,
}

function show(preferences: Partial<UserPreferences> = {}) {
  return render(
    <PreferencesProvider value={{ ...DEFAULT_PREFERENCES, ...preferences }}>
      <QuickPickStrip date="2026-09-11" picks={[PICK]} />
    </PreferencesProvider>,
  )
}

/**
 * A chip is the fastest way into the log, and it was the only one that filed everything
 * under "No meal" — the quick-add bar beside it has honoured the preference since T29.
 */
describe("QuickPickStrip", () => {
  beforeEach(() => {
    vi.mocked(logMeal).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("files a chip under the meal the preference names", async () => {
    vi.mocked(logMeal).mockResolvedValue({ ok: true })
    show({ defaultMealType: "snack" })

    fireEvent.click(screen.getByRole("button", { name: /Banana/ }))

    await waitFor(() => expect(logMeal).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logMeal).mock.calls[0][0]).toMatchObject({
      mealType: "snack",
    })
  })

  it("leaves it unfiled when there is no preference", async () => {
    vi.mocked(logMeal).mockResolvedValue({ ok: true })
    show({ defaultMealType: null })

    fireEvent.click(screen.getByRole("button", { name: /Banana/ }))

    await waitFor(() => expect(logMeal).toHaveBeenCalledTimes(1))
    expect(vi.mocked(logMeal).mock.calls[0][0]).toMatchObject({ mealType: "" })
  })
})
