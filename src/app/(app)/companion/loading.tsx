// Companion-shaped skeleton — the jobs pane beside the proposal pane.
//
// Without this the route inherited `(app)/loading.tsx`, which is `max-w-5xl p-6` with a
// four-card grid; the real page is `max-w-7xl … p-4 md:p-6` with two columns at `lg`. The
// inherited one was visibly the wrong shape, which is worse than none — it promises a
// layout the page then replaces.
//
// One thing worth knowing rather than rediscovering: per HANDOFF, `(app)/loading.tsx`
// streams the shell before `notFound()` can set a status, so `/companion` answers 200 even
// when the companion is switched off. This skeleton therefore briefly advertises a feature
// that may not be configured. Acceptable — with it off there is no nav tab and no palette
// entry, so the only way to this URL is to type it.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-40 animate-pulse rounded" />
        <div className="bg-muted h-3 w-72 animate-pulse rounded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: the four jobs, each a heading over a control. */}
        <div className="bg-card flex flex-col gap-4 rounded-xl border p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted h-3 w-56 animate-pulse rounded" />
              <div className="bg-muted h-9 w-full animate-pulse rounded-lg" />
            </div>
          ))}
        </div>

        {/* Right: the proposal renderer above the pending queue. */}
        <div className="flex flex-col gap-4">
          <div className="bg-card h-64 animate-pulse rounded-xl border" />
          <div className="bg-card h-24 animate-pulse rounded-xl border" />
        </div>
      </div>
    </div>
  )
}
