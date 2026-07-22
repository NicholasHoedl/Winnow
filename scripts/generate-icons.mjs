// Generates the PWA/app icon set from an inline SVG "winnowing" mark
// (a funnel of narrowing bars + a falling grain) in Winnow indigo.
// Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises"
import sharp from "sharp"

const INDIGO = "#4f46e5"

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
  <rect width="512" height="512" rx="112" fill="${INDIGO}"/>${mark}
</svg>`

// Full-bleed square with the mark inside the maskable safe zone (~72%) — for
// maskable + iOS (which applies its own rounding).
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INDIGO}"/>
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
