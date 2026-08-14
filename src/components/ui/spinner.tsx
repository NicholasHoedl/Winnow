import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * An indeterminate "working on it" mark.
 *
 * The fourth copy of `<Loader2 className="size-N animate-spin" />` in this repo — the others
 * are in `ui/sonner.tsx`, `food-database-search.tsx` and `barcode-scanner-dialog.tsx` — so
 * extraction is earned rather than speculative. Those three are left alone; they sit beside
 * their own text ("Searching…", "Starting camera…") and read fine as they are.
 *
 * `aria-hidden`, deliberately. Everywhere this is used something else already carries the
 * semantics: on a button it is `aria-busy`, and inside a `<Link>` it is Next's own route
 * announcer. A `role="status"` here would make a screen reader say it twice.
 *
 * `animate-spin` is unconditional — no `motion-safe:`, unlike the skeletons and `Reveal`.
 * A spinner that does not spin is indistinguishable from a hang, which is the exact thing
 * this exists to rule out.
 *
 * `data-pending` is the e2e handle. Tests locate by it rather than by text, because none of
 * these render any text.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2
      data-slot="spinner"
      data-pending=""
      aria-hidden
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
