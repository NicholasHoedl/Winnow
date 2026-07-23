"use client"

import * as React from "react"

import {
  DEFAULT_PALETTE,
  PALETTE_IDS,
  PALETTE_STORAGE_KEY,
} from "@/lib/palettes"

// A tiny external store backed by the <html data-palette> attribute (the source
// of truth, set pre-paint) + localStorage. useSyncExternalStore reads it in a
// hydration-safe way — no `mounted` / setState-in-effect pattern.

let listeners: Array<() => void> = []

function emit() {
  for (const l of listeners) l()
}

function subscribe(callback: () => void): () => void {
  listeners.push(callback)
  // Keep tabs in sync when the palette changes elsewhere.
  window.addEventListener("storage", callback)
  return () => {
    listeners = listeners.filter((l) => l !== callback)
    window.removeEventListener("storage", callback)
  }
}

function getSnapshot(): string {
  const attr = document.documentElement.getAttribute("data-palette")
  return attr && PALETTE_IDS.includes(attr) ? attr : DEFAULT_PALETTE
}

function getServerSnapshot(): string {
  return DEFAULT_PALETTE
}

export function setPalette(id: string): void {
  if (!PALETTE_IDS.includes(id)) return
  document.documentElement.setAttribute("data-palette", id)
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, id)
  } catch {
    /* storage may be unavailable — the attribute change still applies */
  }
  emit()
}

export function usePalette(): { palette: string; setPalette: (id: string) => void } {
  const palette = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  return { palette, setPalette }
}
