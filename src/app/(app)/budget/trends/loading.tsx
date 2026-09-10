import { BudgetHeader } from "../_components/budget-header"

// Trends shaped skeleton: the header is real, and two chart-sized boxes wait.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        description={
          <span className="bg-muted block h-3 w-72 max-w-full animate-pulse rounded" />
        }
      />
      <div className="bg-card h-56 animate-pulse rounded-xl border" />
      <div className="bg-card mt-6 h-56 animate-pulse rounded-xl border" />
    </div>
  )
}
