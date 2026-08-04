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
    // Must track --background and --primary in globals.css. The OS reads these to
    // paint the splash screen and task-switcher chrome, and cannot see a CSS variable.
    background_color: "#fbf6f3",
    theme_color: "#577f67",
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
