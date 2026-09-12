import type * as React from "react"

import { Card, CardContent } from "@/components/ui/card"

/** Consistent frame for each settings group: a display heading + optional
 * description above a card body. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section>
      {/* Less room below a heading that stands alone (T38). The margin is sized for a
          title with a description under it; on `/settings/account` and `/settings/data`,
          the two pages without one, it left the heading as far from the card it heads as
          from the tab strip above it. */}
      <div className={description ? "mb-3" : "mb-1"}>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
