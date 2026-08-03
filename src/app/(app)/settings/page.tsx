import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { getFeedToken } from "@/modules/calendar/queries"
import { getUserPreferences } from "@/modules/preferences/queries"

import { SettingsView } from "./_components/settings-view"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const [preferences, feedToken, headerList] = await Promise.all([
    getUserPreferences(),
    getFeedToken(),
    headers(),
  ])

  // Built from the request rather than configured: the app is reached at a tailnet
  // hostname nothing in the codebase knows, and `tailscale serve` terminates TLS in front
  // of it, so the proto has to come from the forwarding header. Display only — nothing
  // authenticates on it, so a spoofed Host is a cosmetic problem, not a hole.
  const proto = headerList.get("x-forwarded-proto") ?? "http"
  const host = headerList.get("host") ?? "localhost:3000"
  const feedUrl = `${proto}://${host}/api/calendar/${feedToken}`

  return (
    <SettingsView
      user={{
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }}
      preferences={preferences}
      feedUrl={feedUrl}
    />
  )
}
