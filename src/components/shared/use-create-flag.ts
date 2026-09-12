"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * `?new=<kind>` opens a page's own create dialog on arrival (T36).
 *
 * The dashboard and the command palette name actions — "Add event", "New habit", "New
 * routine" — and used to deliver the PAGE those actions live on, with the same words still
 * to press. A link named for an action should perform it, so the three pages that own such
 * a dialog read a flag and open it once.
 *
 * Once is the operative word, and it is why the flag is then taken back out of the URL with
 * `router.replace`: a reload, or the back button, must not reopen a dialog already dealt
 * with. Every other parameter rides along untouched, so `?view=`/`?date=` still say what
 * they said.
 *
 * "Once" means once per arrival of the flag, NOT once per mount. The palette is global, so
 * the commonest way to use "New habit" is from the habits page itself: the flag arrives at
 * a component that is already mounted, and a latch held for the life of the mount would
 * swallow it — leaving the flag stranded in the URL with no dialog, and a reload of that
 * URL then opening one. Clearing the flag is therefore what re-arms this, which is the same
 * event the replace below causes.
 *
 * `open` is called at most once per flag, so a caller may pass an inline closure — the
 * effect re-running with a new one costs a ref check and returns.
 */
export function useCreateFlag(kind: string, open: () => void): void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const opened = React.useRef(false)

  React.useEffect(() => {
    if (searchParams.get("new") !== kind) {
      opened.current = false
      return
    }
    if (opened.current) return
    opened.current = true
    open()
    const params = new URLSearchParams(searchParams.toString())
    params.delete("new")
    const rest = params.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
  }, [kind, open, pathname, router, searchParams])
}
