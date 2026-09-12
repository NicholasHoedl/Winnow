import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { DEFAULT_PREFERENCES } from "@/lib/preferences"

import { DefaultsSection } from "./defaults-section"

// `"use server"` — importing for real drags in the database, the same treatment
// `region-section.test.tsx` gives it. Nothing here saves.
vi.mock("@/modules/preferences/actions", () => ({
  setDefaultPreferences: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/** The form refreshes the route after a save; nothing in this file gets that far. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

function show() {
  return render(
    <DefaultsSection preferences={DEFAULT_PREFERENCES} lists={[]} />,
  )
}

/**
 * T41 (Pass 7): what these controls are CALLED.
 *
 * Most of this page's labels sit over a `Segmented`, which names its own group. The
 * selects do not: a `FieldLabel` with no `htmlFor` names nothing, so the trigger's
 * accessible name was whichever value it happened to be showing — "Dashboard", "Other" —
 * and the words above it reached nobody who could not see them.
 */
describe("DefaultsSection", () => {
  it("names its selects after the labels above them", () => {
    show()

    expect(screen.getByRole("combobox", { name: "Start on" })).toBeVisible()
    expect(
      screen.getByRole("combobox", { name: "Quick-added meals go to" }),
    ).toBeVisible()
    // The one that was already right, so this test says what the rule is rather than
    // listing two exceptions to it.
    expect(screen.getByRole("combobox", { name: "Default list" })).toBeVisible()
  })
})
