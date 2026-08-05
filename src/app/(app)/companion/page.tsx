import { notFound } from "next/navigation"

import { AI_READY } from "@/lib/config"
import { todayInZone } from "@/lib/date"
import {
  getPendingProposals,
  getPlannableGoals,
} from "@/modules/companion/queries"
import { getCategories } from "@/modules/budget/queries"
import { getUserPreferences } from "@/modules/preferences/queries"

import { CompanionView } from "./_components/companion-view"

/**
 * The companion is opt-in and off by default (ADR-0011). With `AI_ENABLED` unset — or set
 * without a base URL and model — this route does not exist at all, rather than rendering
 * a page whose only button fails. Nothing else in the app hints the feature is there.
 */
export default async function CompanionPage() {
  if (!AI_READY) notFound()

  const { timeZone, currency } = await getUserPreferences()
  const [goals, pending, categories] = await Promise.all([
    getPlannableGoals(),
    getPendingProposals(),
    // Names and ids, so the import renderer can show which rows matched a category the
    // user actually has — and which will land uncategorised.
    getCategories(),
  ])

  return (
    <CompanionView
      goals={goals}
      pending={pending}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      currency={currency}
      today={todayInZone(new Date(), timeZone)}
    />
  )
}
