import { getUserPreferences } from "@/modules/preferences/queries"

import { DefaultsSection } from "../_components/defaults-section"
import { NotificationsSection } from "../_components/notifications-section"

/**
 * Defaults, and the daily digest beneath them.
 *
 * The digest is one toggle with a form and an action of its own, which is too little for
 * a page and exactly what the Dashboard group on this one is about — what the app does
 * when you open it. It keeps its own card and its own Save so the two forms cannot
 * overwrite each other, which is the arrangement they always had.
 */
export default async function DefaultsSettingsPage() {
  const preferences = await getUserPreferences()
  return (
    <div className="flex flex-col gap-8">
      <DefaultsSection preferences={preferences} />
      <NotificationsSection preferences={preferences} />
    </div>
  )
}
