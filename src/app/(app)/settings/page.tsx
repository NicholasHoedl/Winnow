import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

import { SETTINGS_PAGES } from "@/components/shared/settings-pages"

/**
 * The overview: a card per settings page, each saying what it holds.
 *
 * A page rather than a redirect to the first section, which was the cheaper option. On a
 * phone the tab strip wraps to two rows and reads as a cluster of words; a card with a
 * sentence under each name is a menu, and the sidebar's gear and the header's both land
 * here. On a desktop it is one extra hop past a strip that is always visible — accepted.
 *
 * The tab strip hides itself on this route (see `SettingsTabs`), so the cards are the
 * only navigation shown, not a second copy of it.
 */
export default function SettingsPage() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {SETTINGS_PAGES.map((page) => {
        const Icon = page.icon
        return (
          <li key={page.href}>
            <Link href={page.href} className="group block h-full">
              <Card className="hover:bg-accent/40 h-full transition-colors">
                <CardContent className="flex items-start gap-3">
                  <Icon
                    className="text-muted-foreground mt-0.5 size-5 shrink-0"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium">{page.label}</h2>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {page.description}
                    </p>
                  </div>
                  <ChevronRight
                    className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </CardContent>
              </Card>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
