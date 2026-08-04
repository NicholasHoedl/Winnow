// Routines shaped skeleton — a stack of routine cards under the header.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="bg-muted h-8 w-40 animate-pulse rounded" />
          <div className="bg-muted h-3 w-72 animate-pulse rounded" />
        </div>
        <div className="bg-muted h-9 w-32 animate-pulse rounded-lg" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-40 animate-pulse rounded-xl border"
          />
        ))}
      </div>
    </div>
  )
}
