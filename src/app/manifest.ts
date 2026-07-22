import type { MetadataRoute } from "next"

// Next serves this at /manifest.webmanifest and auto-links it. Combined with the
// apple-icon + appleWebApp metadata, this makes Winnow installable on iOS
// ("Add to Home Screen") and launchable standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Winnow",
    short_name: "Winnow",
    description: "Your life, organized in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfbfe",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
