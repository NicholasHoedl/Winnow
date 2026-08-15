// Goals-shaped skeleton: header, the plan tool's bar, then a column of cards. Matches the
// real page's `max-w-4xl p-4 lg:p-6` container so nothing shifts sideways when the data
// lands — the dashboard skeleton's 8px jump is the mistake this is avoiding.
//
// The plan bar is drawn unconditionally even though it renders only when the companion is
// configured. Guessing wrong in that direction costs one card's height once; guessing the
// other way makes the list jump DOWN on every load for anyone who has the feature on.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          <div className="bg-muted h-3 w-64 animate-pulse rounded" />
        </div>
        <div className="bg-muted h-8 w-28 animate-pulse rounded-lg" />
      </div>

      <div className="bg-card mb-5 h-28 animate-pulse rounded-xl border" />

      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-24 animate-pulse rounded-lg border"
          />
        ))}
      </div>
    </div>
  )
}
