import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

// The service worker only registers in a production build — deliberately, because it is
// cache-first on /_next/static/* and those filenames are only content-hashed in a build
// (see src/components/pwa/register-service-worker.tsx). So the ordinary `pnpm test:e2e`,
// which runs `pnpm dev`, structurally cannot reach it.
//
// Hence a second config. It is kept OUT of `pnpm test:e2e` because it pays for a full
// `next build` on every run; `pnpm test:e2e:prod` runs it when the worker is in scope.
//
// Port 3001, not 3000: a worker registered by this suite is scoped to its own origin and
// so can never leak into a `pnpm dev` session on 3000.
const PORT = 3001
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e-prod",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e-prod/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // `next start` prints a warning because next.config.ts sets output: "standalone".
    // It nonetheless serves the build correctly, which is all this suite needs, and it
    // keeps the config to one line. The standalone server is the deployed path and is
    // exercised by the Docker image, not here — note that it does NOT copy public/ on
    // its own, which is why the Dockerfile copies it explicitly.
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    // Auth.js only waives its host check in dev, so a production build rejects
    // localhost:3001 with UntrustedHost and login never completes. This mirrors what
    // the real deployment already sets (docker-compose.prod.yml) rather than relaxing
    // anything: the same variable, for the same reason.
    env: { AUTH_TRUST_HOST: "true" },
    reuseExistingServer: !process.env.CI,
    // A cold `next build` is the long pole here, not the server start.
    timeout: 300_000,
  },
})
