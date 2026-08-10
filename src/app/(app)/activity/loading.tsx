// Activity shaped skeleton — the goal rail beside a quick-add bar over a column of rows.
// Mirrors the real grid's breakpoint so the page doesn't reflow when the data lands.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <div className="mb-5 space-y-2">
        <div className="bg-muted h-8 w-40 animate-pulse rounded" />
        <div className="bg-muted h-3 w-64 animate-pulse rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <div className="hidden lg:flex lg:flex-col lg:gap-2">
          <div className="bg-muted h-3 w-16 animate-pulse rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-card h-20 animate-pulse rounded-lg border"
            />
          ))}
        </div>
        <div className="min-w-0">
          <div className="bg-muted mb-4 h-10 w-full animate-pulse rounded-lg" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-card h-14 animate-pulse rounded-lg border"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
