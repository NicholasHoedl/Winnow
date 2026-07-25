// Today-hub shaped skeleton — header, capture bar, then a single agenda column.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div className="mb-6 space-y-2">
        <div className="bg-muted h-3 w-40 animate-pulse rounded" />
        <div className="bg-muted h-9 w-32 animate-pulse rounded" />
        <div className="bg-muted h-3 w-64 animate-pulse rounded" />
      </div>
      <div className="bg-muted mb-6 h-10 w-full animate-pulse rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card h-10 animate-pulse rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="bg-card h-32 animate-pulse rounded-xl border" />
        <div className="bg-card h-32 animate-pulse rounded-xl border" />
      </div>
    </div>
  )
}
