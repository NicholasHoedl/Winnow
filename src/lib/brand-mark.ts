/**
 * Winnow's mark: a grain of wheat inside the round of a sieve (T34).
 *
 * ONE geometry, two renderers. `BrandMark` in `components/shared` draws it as React for
 * the sidebar, the mobile header and the login page; `scripts/generate-icons.ts` draws
 * it as an SVG string for the favicon and the app icons. Both read the figures below, so
 * the tab and the sidebar cannot drift apart — the previous generator carried its own
 * copy of the mark and a comment promising it tracked the app's colour, and it did not.
 *
 * Two colours: the tile behind and the ink of the mark. The grain's crease is a HOLE in
 * the grain (`fill-rule="evenodd"`), so whatever is behind shows through it and the mark
 * needs no third colour. Drawn in a 512 box; the ring's outer edge sits at 193 from the
 * centre, inside the maskable icon's safe zone once the generator scales it down.
 */
export const BRAND_MARK = {
  viewBox: "0 0 512 512",
  /** The rounded tile's corner radius, the same on every icon size. */
  tileRadius: 112,
  ring: { cx: 256, cy: 256, r: 176, strokeWidth: 34 },
  grain: {
    /** An egg-shaped grain, pointed at the top, with a tapered crease cut out of it. */
    d: "M256 104 C330 150 356 300 256 408 C156 300 182 150 256 104 Z M256 152 C272 220 272 300 256 372 C240 300 240 220 256 152 Z",
    /** Scaled to sit inside the ring and tilted, the way a grain lies rather than stands. */
    transform:
      "translate(256 256) rotate(-22) scale(0.64) translate(-256 -256)",
  },
} as const

/** The mark alone, as SVG markup in `ink`, for renderers that cannot use React. */
export function brandMarkSvg(ink: string): string {
  const { ring, grain } = BRAND_MARK
  return (
    `<circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${ink}" stroke-width="${ring.strokeWidth}"/>` +
    `<path d="${grain.d}" fill="${ink}" fill-rule="evenodd" transform="${grain.transform}"/>`
  )
}
