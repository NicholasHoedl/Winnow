import { isValidDateString } from "@/lib/date"
import { getCategories } from "@/modules/budget/queries"
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

  const [view, categories] = await Promise.all([
    getWeeklyReview(anchor),
    getCategories(),
  ])
  return <ReviewView view={view} categories={categories} />
}
