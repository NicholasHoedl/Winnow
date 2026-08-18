import type { Page } from "./_test"

/**
 * Open a page's overflow menu and choose one of its actions.
 *
 * The secondary actions on `/activity`, `/meals` and `/budget` used to be a row of bare
 * icon buttons in the page header, so a spec could click one directly. They are behind one
 * named menu per page now — a phone has no hover, so an icon was the only thing a touch user
 * ever got, and none of "copy a day" or "repeating tasks" is guessable from its glyph.
 *
 * A helper rather than two lines at each of twenty call sites, because the menu NAME is the
 * part that will move: adding a page, or splitting one, changes which menu an action lives
 * under and nothing else. One map, one place to fix.
 */
const MENU_FOR: Record<string, string> = {
  "Repeating tasks": "Activity actions",
  "Manage lists": "Activity actions",
  "Copy a day": "Meals actions",
  "Food library": "Meals actions",
  "Set targets": "Meals actions",
  "Manage categories": "Budget actions",
  "Set budgets": "Budget actions",
}

export async function pageAction(page: Page, action: string): Promise<void> {
  const menu = MENU_FOR[action]
  if (!menu) throw new Error(`No overflow menu is known to hold "${action}".`)
  await page.getByRole("button", { name: menu }).click()
  await page.getByRole("menuitem", { name: action }).click()
}
