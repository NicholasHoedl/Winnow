import { headers } from "next/headers"

import { getFeedToken } from "@/modules/calendar/queries"

import { CalendarSection } from "../_components/calendar-section"
import { DataSection } from "../_components/data-section"

/**
 * Everything about getting data out of Winnow or into it: export, restore, clear — and
 * the calendar feed, which is an export of a kind (your events, subscribed from another
 * app). The feed URL is also a bearer credential, which its own card says; it sits here
 * rather than under Security because someone looking for it is trying to subscribe, not
 * trying to revoke.
 */
export default async function DataSettingsPage() {
  const [feedToken, headerList] = await Promise.all([getFeedToken(), headers()])

  // Built from the request rather than configured: the app is reached at a tailnet
  // hostname nothing in the codebase knows, and `tailscale serve` terminates TLS in front
  // of it, so the proto has to come from the forwarding header. Display only — nothing
  // authenticates on it, so a spoofed Host is a cosmetic problem, not a hole.
  const proto = headerList.get("x-forwarded-proto") ?? "http"
  const host = headerList.get("host") ?? "localhost:3000"
  const feedUrl = `${proto}://${host}/api/calendar/${feedToken}`

  return (
    <div className="flex flex-col gap-8">
      <DataSection />
      <CalendarSection feedUrl={feedUrl} />
    </div>
  )
}
