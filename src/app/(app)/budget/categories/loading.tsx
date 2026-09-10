import { BudgetHeader } from "../_components/budget-header"

// Categories shaped skeleton. The heading and the strip are real — neither depends on
// data — so only the description, the form and the rows wait.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        description={
          <span className="bg-muted block h-3 w-72 max-w-full animate-pulse rounded" />
        }
      />
      <div className="max-w-xl space-y-2">
        <div className="bg-muted h-9 w-full animate-pulse rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-10 animate-pulse rounded-md border"
          />
        ))}
      </div>
    </div>
  )
}
