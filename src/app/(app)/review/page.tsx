import { isValidDateString } from "@/lib/date"
import { getCategories } from "@/modules/budget/queries"
import { aiReady } from "@/modules/companion/ai-settings"
import { getPendingProposals } from "@/modules/companion/queries"
import {
  getAiSettings,
  getUserPreferences,
} from "@/modules/preferences/queries"
import { dateLocale } from "@/lib/preferences"
import { getWeeklyReview } from "@/modules/review/queries"

import { ReviewView } from "./_components/review-view"

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  // `?week=` is a link target rather than typed input, so anything unparseable falls
  // back to the current week instead of erroring.
  const anchor = week && isValidDateString(week) ? week : undefined

  const [view, categories, aiSettings, pending, preferences] =
    await Promise.all([
      getWeeklyReview(anchor),
      getCategories(),
      getAiSettings(),
      // `summary` only. Without the filter this page would auto-open whatever proposal was
      // newest — a plan, an import — because the view opens `pending[0]`.
      getPendingProposals("summary"),
      getUserPreferences(),
    ])
  return (
    <ReviewView
      view={view}
      categories={categories}
      pending={pending}
      companionEnabled={aiReady(aiSettings)}
      locale={dateLocale(preferences.dateFormat)}
    />
  )
}
