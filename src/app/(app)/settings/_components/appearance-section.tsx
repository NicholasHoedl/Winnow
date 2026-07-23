"use client"

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import { PALETTES } from "@/lib/palettes"
import { usePalette } from "@/components/theme/use-palette"

import { SettingsSection } from "./settings-section"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

function ThemeControl() {
  const { theme, setTheme } = useTheme()
  // `theme` is undefined until next-themes mounts; default the highlight to
  // "system" (matches SSR + first client render, so no hydration mismatch).
  const active = theme ?? "system"

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

function PaletteControl() {
  const { palette, setPalette } = usePalette()

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Colour palette</p>
      <div className="flex flex-wrap gap-2">
        {PALETTES.map((p) => {
          const selected = palette === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPalette(p.id)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                selected
                  ? "border-primary ring-primary/30 ring-2"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="flex items-center">
                <span
                  className="ring-foreground/15 size-4 rounded-full ring-1 ring-inset"
                  style={{ background: p.swatch.primary }}
                />
                <span
                  className="ring-foreground/15 -ml-1.5 size-4 rounded-full ring-1 ring-inset"
                  style={{ background: p.swatch.accent }}
                />
              </span>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AppearanceSection() {
  return (
    <SettingsSection
      title="Appearance"
      description="Theme and accent colours. Saved on this device."
    >
      <div className="flex flex-col gap-6">
        <ThemeControl />
        <PaletteControl />
      </div>
    </SettingsSection>
  )
}
