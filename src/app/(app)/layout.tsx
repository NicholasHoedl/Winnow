import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { AppSidebar } from "@/components/shared/app-sidebar"
import { BottomNav } from "@/components/shared/bottom-nav"
import { ModeToggle } from "@/components/shared/mode-toggle"

// Authenticated app frame: responsive nav shell (desktop sidebar / mobile
// bottom tab bar) around the routed page. The session gate here is the
// authoritative check (the proxy is only a coarse pre-render redirect).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const userName = session.user.name ?? "Account"

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <AppSidebar userName={userName} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar (desktop puts the brand + toggle in the sidebar) */}
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <span className="font-display text-xl font-semibold tracking-tight">
            Winnow
          </span>
          <ModeToggle />
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      <BottomNav />
    </div>
  )
}
