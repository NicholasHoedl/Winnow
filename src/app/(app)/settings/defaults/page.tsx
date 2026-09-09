import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists } from "@/modules/todos/queries"

import { DefaultsSection } from "../_components/defaults-section"
import { NotificationsSection } from "../_components/notifications-section"

/**
 * Defaults, and the daily digest beneath them.
 *
 * The digest is one toggle with a form and an action of its own, which is too little for
 * a page and exactly what the Dashboard group on this one is about — what the app does
 * when you open it. It keeps its own card and its own Save so the two forms cannot
 * overwrite each other, which is the arrangement they always had.
 *
 * `getLists` for the default-list picker. It is `cache()`d and the app shell has already
 * run it for this request, so it costs nothing here.
 */
export default async function DefaultsSettingsPage() {
  const [preferences, lists] = await Promise.all([
    getUserPreferences(),
    getLists(),
  ])
  return (
    <div className="flex flex-col gap-8">
      <DefaultsSection preferences={preferences} lists={lists} />
      <NotificationsSection preferences={preferences} />
    </div>
  )
}
