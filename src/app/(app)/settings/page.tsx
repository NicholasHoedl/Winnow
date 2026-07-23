import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { getUserPreferences } from "@/modules/preferences/queries"

import { SettingsView } from "./_components/settings-view"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const preferences = await getUserPreferences()

  return (
    <SettingsView
      user={{
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }}
      preferences={preferences}
    />
  )
}
