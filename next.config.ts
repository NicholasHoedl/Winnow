import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Checkpoint 0.4 deploy).
  output: "standalone",
  // Pin the workspace root so Next doesn't infer it from stray lockfiles
  // higher up the filesystem (e.g. a package-lock.json in the home dir).
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Restoring a backup posts the whole export as a Server Action argument, and the
      // default ceiling is 1 MB. A measured export runs about 350 bytes per row, so that
      // default is roughly 3,000 rows — reachable after a few years of daily meals and
      // transactions, and a limit nobody would think to check until a restore failed.
      // 8 MB is ~24,000 rows, which is well past any single-user dataset.
      bodySizeLimit: "8mb",
    },
  },
}

export default nextConfig
