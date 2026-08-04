import { todayInZone } from "@/lib/date"
import { getNotes } from "@/modules/notes/queries"
import { getUserPreferences } from "@/modules/preferences/queries"

import { NotesView } from "./_components/notes-view"

export default async function NotesPage() {
  const [notes, preferences] = await Promise.all([
    getNotes(),
    getUserPreferences(),
  ])
  // Resolved server-side, like the dashboard does: computing "today" in the client would
  // use the device clock and disagree with the server-rendered markup on hydration.
  const today = todayInZone(new Date(), preferences.timeZone)
  return <NotesView notes={notes} today={today} />
}
