"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { PALETTE_STORAGE_KEY } from "@/lib/palettes"
import type { Theme } from "@/lib/preferences"
import { setAppearancePreferences } from "@/modules/preferences/actions"

import { usePalette } from "./use-palette"

/** next-themes' own localStorage key — no `storageKey` is passed to the provider. */
const THEME_STORAGE_KEY = "theme"

type Appearance = { theme: Theme; palette: string }

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Keeps the account's saved appearance and this device's in step. Renders nothing.
 *
 * Appearance is applied before first paint by blocking scripts in the root layout,
 * reading localStorage — above any session lookup, so the server cannot supply it in
 * time. That stays true; this only decides what happens when the two disagree.
 *
 * **Adopting**, once per device: a browser with no stored value has never seen this
 * account, so it takes the saved one. That is the whole point of mirroring — a new phone
 * looks like the laptop. It costs one visible change just after mount, on that device
 * only, and never again.
 *
 * **Writing through**, whenever the displayed appearance stops matching the saved one. A
 * device that already has a preference keeps it: someone who just picked a theme here
 * should not have it overruled by whatever another machine last chose.
 *
 * Worth naming: with two active devices, the account holds whatever changed most
 * recently, and a device with its own preference never picks up the other's. That is a
 * deliberate choice rather than a sync protocol — doing better needs a per-device
 * timestamp and is well past what this is for.
 */
export function AppearanceSync({ saved }: { saved: Appearance }) {
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()

  // Adopting is a one-time decision; `theme` is undefined until next-themes has read
  // storage, and acting before then would compare against nothing.
  const adopted = React.useRef(false)
  React.useEffect(() => {
    if (adopted.current || theme === undefined) return
    adopted.current = true
    if (stored(THEME_STORAGE_KEY) === null && saved.theme !== theme) {
      setTheme(saved.theme)
    }
    if (stored(PALETTE_STORAGE_KEY) === null && saved.palette !== palette) {
      setPalette(saved.palette)
    }
  }, [theme, palette, saved, setTheme, setPalette])

  /**
   * What the row actually holds.
   *
   * NOT `saved` on its own. `saved` is the value at page load and never refreshes —
   * `setAppearancePreferences` deliberately skips revalidation, since these values
   * change nothing the server draws. Comparing against a stale `saved` would mean
   * switching to dark and back to system wrote once and then silently left the account
   * on dark, because the second change matched the page-load value.
   */
  const written = React.useRef<Appearance | null>(null)

  React.useEffect(() => {
    if (theme === undefined) return
    /**
     * The palette comes from STORAGE here, not from `palette`.
     *
     * `theme` announces its own readiness by being `undefined`; the palette store does
     * not — it returns DEFAULT_PALETTE as its server snapshot, so the first client render
     * and this effect's first run report indigo whatever the device holds. Believing that
     * wrote the default into the account on every authenticated page load and corrected
     * it a tick later: two writes a navigation, and a window in which a second device
     * reading the account would have seen the wrong palette.
     *
     * localStorage is authoritative and is already correct by the time an effect runs, so
     * it needs no readiness signal. A `useSyncExternalStore` hydration flag also fixes the
     * double write and was tried first — but this component sits ABOVE `{children}` in the
     * (app) layout, so the re-render it forces re-triggers the Suspense boundary wrapping
     * every page, and in dev that left two copies of the page body mounted at once
     * (caught by e2e/task-links.spec.ts). Reading storage re-renders nothing.
     */
    const current = {
      theme: theme as Theme,
      palette: stored(PALETTE_STORAGE_KEY) ?? palette,
    }
    const onRecord = written.current ?? saved
    if (
      current.theme === onRecord.theme &&
      current.palette === onRecord.palette
    ) {
      return
    }
    written.current = current
    // Swallowed on purpose. This is a mirror, not the source of truth — the device is
    // already showing the right thing from localStorage, so a failed save is worth
    // nothing to the person looking at the screen. Letting it reject would surface an
    // unhandled promise rejection on an ordinary page load.
    void setAppearancePreferences(current).catch(() => {})
  }, [theme, palette, saved])

  return null
}
