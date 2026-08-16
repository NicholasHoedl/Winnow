// Route-level loading skeleton for every (app) page — shown while the server component's
// data fetch is in flight (Next wraps this in a Suspense boundary).
//
// Shaped for the DASHBOARD, which is both the landing page and the only route without a
// skeleton of its own. It previously used `max-w-5xl p-6` and a two-column grid of four
// cards against a real page that is `max-w-[120rem] p-4 lg:p-5` with a header button row,
// a quick-capture bar and a single column on mobile — an 8px horizontal shift and roughly
// 100px of vertical jump the instant content landed, on a 393px phone.
//
// Every other route has its own `loading.tsx` and reaches this only if one is deleted, so
// matching the dashboard rather than splitting the difference is the right trade.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[120rem] p-4 lg:p-5">
      {/* Header: eyebrow, title, subtitle, and the row of link buttons beside them. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="bg-muted h-3 w-40 animate-pulse rounded" />
          <div className="bg-muted h-8 w-64 animate-pulse rounded" />
          <div className="bg-muted h-3 w-52 animate-pulse rounded" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted h-7 w-24 animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>

      {/* The quick-capture bar, which the old skeleton omitted entirely. */}
      <div className="bg-card mb-4 h-10 animate-pulse rounded-lg border" />

      {/* One column on a phone, three at `lg` — the real grid's breakpoint, so the layout
          does not reflow when the data lands. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="bg-card h-64 animate-pulse rounded-xl border" />
          <div className="bg-card h-40 animate-pulse rounded-xl border" />
        </div>
        {/* The calendar column, `lg:` only — mirroring the real page, which hides it below
            that breakpoint. Without this the phone would flash a 384px card that vanishes
            the instant the data lands, which is the same class of jump described above. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-5">
          <div className="bg-card h-96 animate-pulse rounded-xl border" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="bg-card h-48 animate-pulse rounded-xl border" />
          <div className="bg-card h-40 animate-pulse rounded-xl border" />
        </div>
      </div>
    </div>
  )
}
