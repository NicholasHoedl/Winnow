import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { DEFAULT_PREFERENCES } from "@/lib/preferences"

import { RegionSection } from "./region-section"

// `"use server"` — importing for real drags in the database, the same treatment
// `transaction-dialog.test.tsx` gives it. Nothing here saves; this is about how the seven
// fields are arranged before anyone touches one.
vi.mock("@/modules/preferences/actions", () => ({
  setRegionPreferences: vi.fn(),
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
  return render(<RegionSection preferences={DEFAULT_PREFERENCES} />)
}

/** Which group a field is in: the index of the last sub-heading before its label. */
function groupOf(label: string): number {
  const field = screen.getByText(label, { selector: "label" })
  const before = screen
    .getAllByRole("heading", { level: 3 })
    .filter(
      (h) =>
        h.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
  return before.length - 1
}

describe("RegionSection", () => {
  it("chunks the fields under sub-headings, in subject order", () => {
    show()

    // The same `h3` sub-heading `DefaultsSection` uses. Two groups, not three: a heading
    // over a single field is a label wearing a heading's clothes.
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Dates and times", "Units"])
  })

  it("keeps all seven fields, each under the heading that describes it", () => {
    show()

    expect(groupOf("Time zone")).toBe(0)
    expect(groupOf("Week starts on")).toBe(0)
    expect(groupOf("Time format")).toBe(0)
    expect(groupOf("Date format")).toBe(0)
    expect(groupOf("Currency")).toBe(1)
    expect(groupOf("Weight")).toBe(1)
    expect(groupOf("Water")).toBe(1)
  })
})
