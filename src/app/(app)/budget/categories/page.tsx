import { getCategories } from "@/modules/budget/queries"

import { CategoriesView } from "./_components/categories-view"

const MONTH_RE = /^\d{4}-\d{2}$/

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const categories = await getCategories()
  return (
    <CategoriesView
      categories={categories}
      // Not read here — only carried, so the strip keeps the month the other pages show.
      month={params.month && MONTH_RE.test(params.month) ? params.month : null}
    />
  )
}
