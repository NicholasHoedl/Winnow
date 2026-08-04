// Notes shaped skeleton — a two-column grid of note cards under the header.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          <div className="bg-muted h-3 w-72 animate-pulse rounded" />
        </div>
        <div className="flex gap-2">
          <div className="bg-muted h-9 w-32 animate-pulse rounded-lg" />
          <div className="bg-muted h-9 w-28 animate-pulse rounded-lg" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-32 animate-pulse rounded-xl border"
          />
        ))}
      </div>
    </div>
  )
}
