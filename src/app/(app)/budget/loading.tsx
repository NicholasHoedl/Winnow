// Budget shaped skeleton — an income/expense/net stat box over a transaction list.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-4 space-y-2">
        <div className="bg-muted h-8 w-32 animate-pulse rounded" />
        <div className="bg-muted h-3 w-60 animate-pulse rounded" />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4 rounded-xl border p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-muted h-3 w-16 animate-pulse rounded" />
            <div className="bg-muted h-6 w-20 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card h-14 animate-pulse rounded-lg border" />
        ))}
      </div>
    </div>
  )
}
