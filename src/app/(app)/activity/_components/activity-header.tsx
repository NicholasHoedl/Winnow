import type * as React from "react"

import { ActivityTabs } from "./activity-tabs"

/**
 * The frame every Activity page shares: the heading, the page's one primary action beside
 * it, the strip of pills, and the page's description under the strip.
 *
 * Not a `layout.tsx`, though Settings uses one: the primary action ("New task", "New
 * habit", "New routine") belongs to the page — it opens that page's dialog — and a layout
 * has no way to take it. So each page renders this instead, and its `loading.tsx` renders
 * it too, which is what keeps the heading and the strip still while the content waits.
 *
 * The heading is "Activity" on every page and the lit pill says which one you are on. The
 * sub-pages used to carry their own "Habits"/"Routines" headings and a "← Activity" link
 * — one of which still said "To-dos" — and the strip makes all of that redundant.
 */
export function ActivityHeader({
  action,
  description,
}: {
  action?: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <header className="mb-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Activity
        </h1>
        {action}
      </div>
      <ActivityTabs />
      {description && (
        <p className="text-muted-foreground mt-3 text-sm">{description}</p>
      )}
    </header>
  )
}
