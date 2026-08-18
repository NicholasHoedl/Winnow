// Generates the PWA/app icon set from an inline SVG "winnowing" mark
// (a funnel of narrowing bars + a falling grain) in Winnow deep teal.
// Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises"
import sharp from "sharp"

// Must track --primary in globals.css. Re-run this script after changing it — nothing
// regenerates the icons automatically.
//
// This was `#577f67` — deep_teal's own value — for the whole life of the project, under
// this same comment claiming it tracked `--primary`. It did not: globals.css records
// `--primary` being darkened to #456652 specifically because #577f67 measured 4.22:1 on
// linen and failed AA. So every icon was generated from the shade the app had rejected.
// Nothing enforces the link between these two files; the comment above is the whole
// mechanism, which is why it drifted.
//
// src/app/favicon.ico used to be listed here as "not produced by this script and replaced
// by hand". It is gone — Next auto-links the icon.svg and apple-icon.png written below,
// and sharp cannot emit .ico, so maintaining one by hand bought nothing.
const BRAND = "#456652"

// Mark paths, centered ~ (256, 256).
const mark = `
  <g fill="#ffffff">
    <rect x="140" y="132" width="232" height="44" rx="22"/>
    <rect x="172" y="210" width="168" height="44" rx="22"/>
    <rect x="204" y="288" width="104" height="44" rx="22"/>
    <circle cx="256" cy="378" r="28"/>
  </g>`

// Rounded tile — favicon + "any" icons.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BRAND}"/>${mark}
</svg>`

// Full-bleed square with the mark inside the maskable safe zone (~72%) — for
// maskable + iOS (which applies its own rounding).
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BRAND}"/>
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">${mark}</g>
</svg>`

async function main() {
  await mkdir("public/icons", { recursive: true })

  await sharp(Buffer.from(tile)).resize(192, 192).png().toFile("public/icons/icon-192.png")
  await sharp(Buffer.from(tile)).resize(512, 512).png().toFile("public/icons/icon-512.png")
  await sharp(Buffer.from(fullBleed)).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png")
  // Next.js app-icon conventions (auto-linked into <head>).
  await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile("src/app/apple-icon.png")
  await writeFile("src/app/icon.svg", tile)

  console.log("Icons written to public/icons/ and src/app/")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
