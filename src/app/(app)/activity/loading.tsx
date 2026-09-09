import { ActivityHeader } from "./_components/activity-header"

// Activity shaped skeleton — the heading and the strip are real (neither needs data), then
// a button-shaped action, the quick-add bar, the search field and a column of rows, in the
// page's own running order so nothing reflows when the data lands. The routines row and
// the habit strip left this page in T25, and so left here.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
      <ActivityHeader
        action={<div className="bg-muted h-9 w-28 animate-pulse rounded-lg" />}
      />
      <div className="bg-muted mb-4 h-10 w-full animate-pulse rounded-lg" />
      <div className="bg-muted mb-3 h-9 w-full animate-pulse rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card h-14 animate-pulse rounded-lg border"
          />
        ))}
      </div>
    </div>
  )
}
