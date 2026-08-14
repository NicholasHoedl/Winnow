"use client"

import { useLinkStatus } from "next/link"

import { Spinner } from "@/components/ui/spinner"

/**
 * Swaps its children for a spinner while the enclosing `<Link>`'s navigation is in flight.
 *
 * Must be rendered INSIDE a `<Link>`: `useLinkStatus` reads the nearest ancestor link's
 * status context, which every `<Link>` already provides. No change to any link is needed.
 * Outside one it returns the idle default rather than throwing, so a stray usage degrades to
 * "never pending" instead of breaking the page.
 *
 * The pending flag clears when the navigation transition commits — which is exactly when a
 * route's `loading.tsx` renders. The handoff is therefore seamless: tap → spinner → skeleton
 * → content, with no gap and no overlap.
 *
 * Two things this is for, and the second is the one that matters most:
 *
 * 1. Cross-route navigation, where a warm prefetch shows the skeleton instantly but a cold
 *    one (stale router cache, PWA resumed from background, cellular) shows nothing at all.
 * 2. **Same-route parameter changes** — `/budget?month=…`, `/meals?date=…`, `/review?week=…`.
 *    The segment is not remounted, so `loading.tsx` NEVER fires for these and the entire old
 *    page sits there for the whole round trip. On a phone that is indistinguishable from a
 *    frozen app, and nothing else in the app will ever indicate it.
 *
 * ## Why `children` and not an `icon` prop
 *
 * `(app)/layout.tsx` and `review-view.tsx` are SERVER components. Passing a lucide icon as a
 * prop passes a *function* across the RSC boundary, which throws at render. An
 * already-rendered `<ChevronLeft />` element is serializable, so children works from server
 * and client parents alike — one API for every call site.
 *
 * ## Why the swap is icon-only, everywhere
 *
 * `e2e/navigation.spec.ts` asserts `nav.getByRole("link").allInnerTexts()` equals the seven
 * nav labels exactly, and that all seven links are the same height. `innerText` includes
 * `sr-only` content, because that class clips rather than using `display:none` — so adding
 * any visually-hidden "Loading…" text here would break that spec. Swapping a `size-5` icon
 * for a `size-5` spinner changes neither the text nor the box.
 */
export function LinkPending({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useLinkStatus()
  return pending ? <Spinner className={className} /> : children
}
