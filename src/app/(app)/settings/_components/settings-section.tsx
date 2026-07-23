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
      <div className="mb-3">
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
