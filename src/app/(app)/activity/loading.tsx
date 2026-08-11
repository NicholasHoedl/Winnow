// Activity shaped skeleton — the goal rail beside a quick-add bar, a habit strip, and a
// column of rows. Mirrors the real grid's breakpoint AND its running order so the page does
// not reflow when the data lands; the strip is the piece added in T12d, and leaving it out
// would make the list jump down by its height the moment the query returned.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <div className="mb-5 space-y-2">
        <div className="bg-muted h-8 w-40 animate-pulse rounded" />
        <div className="bg-muted h-3 w-64 animate-pulse rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* Three goal cards and the routines line — the rail lost its routines and habits
            BLOCKS in T12d, so a four-card column would now overstate its height. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-2">
          <div className="bg-muted h-3 w-16 animate-pulse rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-card h-20 animate-pulse rounded-lg border"
            />
          ))}
          <div className="bg-muted mt-2 h-4 w-32 animate-pulse rounded" />
        </div>
        <div className="min-w-0">
          <div className="bg-muted mb-4 h-10 w-full animate-pulse rounded-lg" />
          {/* The habit strip: a heading over one row of w-40 chips. */}
          <div className="mb-4 flex flex-col gap-2">
            <div className="bg-muted h-3 w-14 animate-pulse rounded" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-card h-24 w-40 shrink-0 animate-pulse rounded-lg border"
                />
              ))}
            </div>
          </div>
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
