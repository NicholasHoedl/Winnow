import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { SettingsSection } from "./settings-section"

/** The block holding the heading, and the description when there is one. */
function headerOf(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).parentElement!
}

/** The Tailwind step in that block's bottom margin — `mb-3` is 3. */
function marginBelow(title: string): number {
  const match = /(?:^|\s)mb-(\d+)(?:\s|$)/.exec(headerOf(title).className)
  if (!match) throw new Error(`no bottom margin on the "${title}" header`)
  return Number(match[1])
}

describe("SettingsSection", () => {
  // T38 (Pass 4, proximity). `/settings/account` and `/settings/data` are the two pages
  // with no description, and the margin sized for a title-plus-description pair left their
  // heading sitting as far from the card it heads as from the tab strip above it. A
  // heading that far from its content labels nothing.
  it("holds the heading closer to its card when there is no description", () => {
    render(
      <>
        <SettingsSection title="Described" description="What this page holds.">
          <p>body</p>
        </SettingsSection>
        <SettingsSection title="Bare">
          <p>body</p>
        </SettingsSection>
      </>,
    )

    expect(marginBelow("Bare")).toBeLessThan(marginBelow("Described"))
  })
})
