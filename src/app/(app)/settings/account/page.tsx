import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { AccountSection } from "../_components/account-section"

// The one page that needs the session itself rather than a query: the name and email it
// shows come off the JWT, which is also why saving the name refreshes the router — the
// action set a fresh cookie.
export default async function AccountSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <AccountSection
      defaultName={session.user.name ?? ""}
      email={session.user.email ?? ""}
    />
  )
}
