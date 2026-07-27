// View-agnostic skeleton. It used to be a 6×7 block of day cells, which was right
// while the month grid was the only thing behind it — but `loading.tsx` takes no
// props and cannot read `?view=`, so with a week, day or agenda view now reachable by
// URL it would flash a month grid before rendering something else entirely. A neutral
// panel of the right size and shape is honest for all four.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        <div className="bg-muted h-9 w-32 animate-pulse rounded-lg" />
      </div>
      <div className="mb-4 flex justify-center gap-2">
        <div className="bg-muted h-8 w-64 animate-pulse rounded-lg" />
      </div>
      <div className="bg-card animate-pulse rounded-xl border">
        <div className="bg-muted/60 h-10 rounded-t-xl" />
        <div className="h-[32rem]" />
      </div>
    </div>
  )
}
