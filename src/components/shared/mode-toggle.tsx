"use client"

import * as React from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

// "Have we hydrated yet?" without a setState-in-effect, which the React-compiler lint
// rejects (react-hooks/set-state-in-effect) — the same swap the calendar clock made in
// T5b. The server snapshot is false and the client snapshot is true, so the first client
// render still matches the server and the icon only resolves afterwards. Nothing ever
// changes, hence the no-op subscribe.
const NEVER_CHANGES = () => () => {}

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = React.useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  )

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  )
}
