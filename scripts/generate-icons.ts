// Generates the favicon and the PWA/app icon set from the brand mark — a grain of wheat
// inside the round of a sieve (T34) — in Winnow green. The geometry is `src/lib/brand-mark.ts`,
// shared with the React `BrandMark` the sidebar, header and login page draw, so the tab and
// the app can no longer disagree about what the mark is.
//
// Run: pnpm icons
//
// Nothing regenerates the icons automatically; re-run this after changing the mark or
// the colour below.
import { mkdir, writeFile } from "node:fs/promises"
import sharp from "sharp"

import { BRAND_MARK, brandMarkSvg } from "../src/lib/brand-mark"

// Must track --primary in globals.css. It is #456652 rather than deep_teal's own #577f67
// because #577f67 measured 4.22:1 on linen and failed AA (see globals.css); the earlier
// generator was written against the rejected shade for the whole life of the project,
// under a comment claiming it tracked this value. The comment is still the whole
// mechanism — so check here first when the primary moves.
const BRAND = "#456652"
// --primary-foreground: the linen the mark is drawn in.
const INK = "#fdfaf9"

const mark = brandMarkSvg(INK)

// Rounded tile — favicon + "any" icons.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${BRAND_MARK.viewBox}">
  <rect width="512" height="512" rx="${BRAND_MARK.tileRadius}" fill="${BRAND}"/>
  ${mark}
</svg>`

// Full-bleed square with the mark inside the maskable safe zone (~72%) — for
// maskable + iOS (which applies its own rounding).
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${BRAND_MARK.viewBox}">
  <rect width="512" height="512" fill="${BRAND}"/>
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">${mark}</g>
</svg>`

async function main() {
  await mkdir("public/icons", { recursive: true })

  await sharp(Buffer.from(tile))
    .resize(192, 192)
    .png()
    .toFile("public/icons/icon-192.png")
  await sharp(Buffer.from(tile))
    .resize(512, 512)
    .png()
    .toFile("public/icons/icon-512.png")
  await sharp(Buffer.from(fullBleed))
    .resize(512, 512)
    .png()
    .toFile("public/icons/icon-maskable-512.png")
  // Next.js app-icon conventions (auto-linked into <head>).
  await sharp(Buffer.from(fullBleed))
    .resize(180, 180)
    .png()
    .toFile("src/app/apple-icon.png")
  await writeFile("src/app/icon.svg", tile)

  console.log("Icons written to public/icons/ and src/app/")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
