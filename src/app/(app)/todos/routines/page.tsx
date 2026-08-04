import { todayInZone } from "@/lib/date"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getRoutines } from "@/modules/routines/queries"
import { getLists } from "@/modules/todos/queries"

import { RoutinesView } from "./_components/routines-view"

export default async function RoutinesPage() {
  const [{ timeZone }, routines, lists] = await Promise.all([
    getUserPreferences(),
    getRoutines(),
    getLists(),
  ])
  // Resolved server-side so the run dialog's default anchor matches what the rest of the
  // app calls "today", rather than whatever the device clock says.
  return (
    <RoutinesView
      routines={routines}
      lists={lists}
      today={todayInZone(new Date(), timeZone)}
    />
  )
}
