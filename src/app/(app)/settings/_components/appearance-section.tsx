"use client"

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import { useHydrated } from "@/components/shared/use-hydrated"

import { SettingsSection } from "./settings-section"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

function ThemeControl() {
  const { theme, setTheme } = useTheme()
  /**
   * Gated on hydration, not just on `theme` being undefined.
   *
   * The old `theme ?? "system"` assumed next-themes reports undefined until an effect
   * runs, so server and first client render would agree. It doesn't — it reads storage
   * synchronously, so a device set to dark rendered `aria-pressed="true"` on Dark while
   * the server had said System. React reported the mismatch and, in its words, would
   * not patch it up: the pressed state then stayed frozen at the server's answer
   * forever, and a later click added a SECOND pressed button rather than moving it.
   *
   * Reading `theme` only after hydration makes the first client render match the server
   * by construction, and the correction lands as an ordinary update. `useHydrated`
   * already exists for `ModeToggle`, which has the same problem.
   */
  const hydrated = useHydrated()
  const active = hydrated ? (theme ?? "system") : "system"

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Theme</p>
      <div className="bg-muted inline-flex rounded-lg p-0.5">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            aria-pressed={active === t.value}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AppearanceSection() {
  return (
    <SettingsSection
      title="Appearance"
      description="Saved to your account, so a new device picks it up."
    >
      <ThemeControl />
    </SettingsSection>
  )
}
