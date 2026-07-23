// Pre-built colour palettes. Each redefines only the "brand" tokens (primary +
// accent + their rings) via a `data-palette` attribute on <html>; the neutral
// system and the category rainbow stay fixed. The actual token values live in
// globals.css — this file just drives the picker + the pre-paint script.

export type Palette = {
  id: string
  label: string
  // Light-mode swatch colours for the picker preview (static, not the live vars).
  swatch: { primary: string; accent: string }
}

export const PALETTES: Palette[] = [
  {
    id: "indigo",
    label: "Indigo & Amber",
    swatch: { primary: "oklch(0.505 0.19 273)", accent: "oklch(0.79 0.15 76)" },
  },
  {
    id: "emerald",
    label: "Emerald & Coral",
    swatch: { primary: "oklch(0.52 0.14 158)", accent: "oklch(0.72 0.16 28)" },
  },
  {
    id: "rose",
    label: "Rose & Gold",
    swatch: { primary: "oklch(0.55 0.2 12)", accent: "oklch(0.8 0.13 88)" },
  },
  {
    id: "teal",
    label: "Teal & Tangerine",
    swatch: { primary: "oklch(0.55 0.12 210)", accent: "oklch(0.75 0.16 55)" },
  },
  {
    id: "violet",
    label: "Violet & Lime",
    swatch: { primary: "oklch(0.52 0.2 300)", accent: "oklch(0.8 0.17 128)" },
  },
]

export const DEFAULT_PALETTE = "indigo"
export const PALETTE_IDS: string[] = PALETTES.map((p) => p.id)
export const PALETTE_STORAGE_KEY = "winnow-palette"

// Blocking script injected before paint so the stored palette applies with no
// flash. Kept tiny + dependency-free (it runs as a raw string in <body>).
export const PALETTE_SCRIPT = `(function(){try{var p=localStorage.getItem('${PALETTE_STORAGE_KEY}');var ok=${JSON.stringify(
  PALETTE_IDS,
)};if(p&&ok.indexOf(p)>-1){document.documentElement.setAttribute('data-palette',p)}}catch(e){}})()`
