// About this file: the page component for /review, a server component. It loads the week
// that `?week=` names, plus what the view needs beside it, and hands it to `ReviewView`.
//
// What you'll find here:
// - `ReviewPage` (default export): reads `?week=`, and falls back to the current week
//   when it is not a valid date.
// - Loads, in parallel: the weekly review, budget categories, AI settings, pending
//   `summary` proposals, and the user's preferences.
// - Renders: `ReviewView`, with `companionEnabled` from `aiReady` and `locale` from the
//   saved date format.
//
// Related: `_components/review-view.tsx`, which lays the week out as cards.

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
