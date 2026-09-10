import { BudgetHeader } from "../_components/budget-header"

// Budgets shaped skeleton. The heading and the strip are real — neither depends on data —
// so only the month row, the bars and the form wait, and nothing above them moves when
// the queries land.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        description={
          <span className="bg-muted block h-3 w-72 max-w-full animate-pulse rounded" />
        }
      />
      <div className="divide-y rounded-xl border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 p-3">
            <div className="bg-muted h-3 w-40 animate-pulse rounded" />
            <div className="bg-muted h-1.5 w-full animate-pulse rounded-full" />
          </div>
        ))}
      </div>
      <div className="bg-card mt-6 h-48 animate-pulse rounded-xl border" />
    </div>
  )
}
