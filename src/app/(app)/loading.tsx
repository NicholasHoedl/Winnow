// Route-level loading skeleton for every (app) page — shown while the server
// component's data fetch is in flight (Next wraps this in a Suspense boundary).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 space-y-2">
        <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        <div className="bg-muted h-8 w-64 animate-pulse rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-40 animate-pulse rounded-xl border"
          />
        ))}
      </div>
    </div>
  )
}
