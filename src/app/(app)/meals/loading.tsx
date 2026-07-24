// Meals shaped skeleton — a macro summary panel over the day's meal sections.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-4 space-y-2">
        <div className="bg-muted h-8 w-32 animate-pulse rounded" />
        <div className="bg-muted h-3 w-56 animate-pulse rounded" />
      </div>
      <div className="bg-card mb-6 h-28 animate-pulse rounded-xl border" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card h-20 animate-pulse rounded-lg border" />
        ))}
      </div>
    </div>
  )
}
