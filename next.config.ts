import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't infer it from stray lockfiles
  // higher up the filesystem (e.g. a package-lock.json in the home dir).
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
