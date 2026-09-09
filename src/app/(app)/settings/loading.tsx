// Inside the settings layout, so the heading and tab strip are already on screen and only
// the card area waits. Two cards, not four: no settings page holds more than two now, and
// a skeleton taller than what replaces it is a jump rather than a placeholder.
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-card h-48 animate-pulse rounded-xl border" />
      ))}
    </div>
  )
}
