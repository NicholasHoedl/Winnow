// Settings shaped skeleton — a stack of section cards under the header.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-6 space-y-2">
        <div className="bg-muted h-8 w-36 animate-pulse rounded" />
        <div className="bg-muted h-3 w-64 animate-pulse rounded" />
      </div>
      <div className="flex flex-col gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card h-36 animate-pulse rounded-xl border" />
        ))}
      </div>
    </div>
  )
}
