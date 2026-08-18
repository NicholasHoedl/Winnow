import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

import { TEST_DATABASE_URL } from "./e2e/_test-db"

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
  /**
   * **This suite ran against the real database until 2026-08-17, and nothing said so.**
   *
   * T12g gave `playwright.config.ts` its own `winnow_test` — globalSetup, a derived
   * connection string, and `assertSafeToDestroy` refusing any target not ending in `_test`.
   * None of it reached here. This config had no globalSetup and passed only
   * `AUTH_TRUST_HOST` to its server, so `pnpm build && pnpm start` inherited the shell's
   * `DATABASE_URL` — the real one.
   *
   * It never did damage, because both specs in `e2e-prod/` are read-only `goto` checks. That
   * is not a safety property, it is a coincidence: the first spec anyone adds that creates a
   * row would write it to real data with nothing in the way. Same globalSetup as the main
   * config now, so the two suites cannot drift on this again.
   */
  globalSetup: "./e2e/global-setup.ts",
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
    env: {
      // Auth.js only waives its host check in dev, so a production build rejects
      // localhost:3001 with UntrustedHost and login never completes. This mirrors what
      // the real deployment already sets (docker-compose.prod.yml) rather than relaxing
      // anything: the same variable, for the same reason.
      AUTH_TRUST_HOST: "true",
      // The other half of the globalSetup note above. Both `next build` and `next start`
      // read this through next.config.ts, so one variable covers the pair.
      DATABASE_URL: TEST_DATABASE_URL,
      // Its own build output. Without this the production build overwrites `.next` — the
      // dev server's cache — so running this suite left the next `pnpm dev` recompiling
      // from cold, and `docs/HANDOFF.md` records what a stale `.next` costs.
      NEXT_DIST_DIR: ".next-e2e-prod",
    },
    // NEVER reused, matching the main config, and this is the half that makes the `env`
    // above mean anything: the environment of a server you did not start is not yours to
    // set. Reuse here meant attaching to whatever was already on 3001 — quite possibly a
    // dev server pointed at real data — and passing the suite without building production
    // at all, which would silently stop testing the one thing this config exists for.
    reuseExistingServer: false,
    // A cold `next build` is the long pole here, not the server start.
    timeout: 300_000,
  },
})
