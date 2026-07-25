import { cn } from "@/lib/utils"

/** The branded gradient panel used for the app's "look here first" surfaces —
 * the dashboard's Up next rail and the daily digest banner. */
export function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "from-primary/10 ring-foreground/10 relative overflow-hidden rounded-xl bg-gradient-to-br to-transparent p-5 shadow-sm ring-1",
        className,
      )}
    >
      {children}
    </div>
  )
}
