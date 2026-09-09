import { ActivityHeader } from "../_components/activity-header"

// Habits shaped skeleton — the section's real heading and strip, a button-shaped action
// and a line for the description, then a stack of habit cards, each a ring beside a
// heatmap.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <ActivityHeader
        action={<div className="bg-muted h-9 w-28 animate-pulse rounded-lg" />}
        description={
          <span className="bg-muted block h-3 w-72 max-w-full animate-pulse rounded" />
        }
      />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card flex gap-4 rounded-xl border p-4">
            <div className="bg-muted size-16 shrink-0 animate-pulse rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="bg-muted h-4 w-40 animate-pulse rounded" />
              <div className="bg-muted h-22 w-full animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
