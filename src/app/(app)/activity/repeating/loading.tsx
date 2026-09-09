import { ActivityHeader } from "../_components/activity-header"

// Repeating-tasks shaped skeleton. The heading and the strip are real — neither depends on
// data — so only the description and the rows wait, and nothing above them moves when the
// query lands.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <ActivityHeader
        description={
          <span className="bg-muted block h-3 w-72 max-w-full animate-pulse rounded" />
        }
      />
      <div className="max-w-xl space-y-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-10 animate-pulse rounded-md border"
          />
        ))}
      </div>
    </div>
  )
}
