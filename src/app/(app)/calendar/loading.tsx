// Month-grid shaped skeleton — a 6×7 block of day cells under a title/toolbar row.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        <div className="bg-muted h-9 w-32 animate-pulse rounded-lg" />
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="bg-card h-20 animate-pulse sm:h-24" />
        ))}
      </div>
    </div>
  )
}
