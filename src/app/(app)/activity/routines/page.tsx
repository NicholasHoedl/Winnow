import { todayInZone } from "@/lib/date"
import { aiReady } from "@/modules/companion/ai-settings"
import { getPendingProposals } from "@/modules/companion/queries"
import { getAiSettings, getUserPreferences } from "@/modules/preferences/queries"
import { getRoutines } from "@/modules/routines/queries"
import { getLists } from "@/modules/todos/queries"

import { RoutinesView } from "./_components/routines-view"

export default async function RoutinesPage() {
  const [{ timeZone }, routines, lists, aiSettings, pending] =
    await Promise.all([
      getUserPreferences(),
      getRoutines(),
      getLists(),
      getAiSettings(),
      // `routine` only. Without the filter this page would auto-open whatever proposal
      // was newest — an import, a narrated week — because the view opens `pending[0]`.
      getPendingProposals("routine"),
    ])
  // Resolved server-side so the run dialog's default anchor matches what the rest of the
  // app calls "today", rather than whatever the device clock says.
  return (
    <RoutinesView
      routines={routines}
      lists={lists}
      today={todayInZone(new Date(), timeZone)}
      pending={pending}
      companionEnabled={aiReady(aiSettings)}
    />
  )
}
