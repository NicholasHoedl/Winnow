import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

const baseURL = "http://localhost:3000"

// Serial, single-worker: the specs share one single-user Postgres and create /
// clean their own data, so parallelism would race. Reuses a running dev server.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // A second setup pass, after auth because it needs the session: the companion's
    // configuration lives in the database now (T11), so the suite writes the stub's
    // details through the settings page before any spec runs.
    {
      name: "ai-setup",
      testMatch: /ai\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup", "ai-setup"],
    },
  ],
  // Two servers: the app, and a stand-in AI provider.
  //
  // The stub is a server rather than a Playwright route interception because the call it
  // answers is made server-side — `page.route()` never sees it. The app reaches it through
  // AI_BASE_URL exactly as it would reach a real provider, so the whole path including the
  // Zod parse is under test.
  //
  // The app reaches the stub using whatever `user_preferences` says, which `ai.setup.ts`
  // writes before the specs run. This used to come from `.env` — that mattered because
  // `reuseExistingServer` means the dev server may already be running and Playwright's
  // `env` here would not reach it. Settings in the database sidestep that entirely: they
  // are read per request, so an already-running server picks them up. See e2e/_ai-stub.mjs.
  webServer: [
    {
      command: "node e2e/_ai-stub.mjs",
      // `port`, not `url`: a url check waits for a sub-400 response, and the stub answers
      // 404 to everything except /chat/completions. Waiting for the socket is the honest
      // readiness signal here.
      port: 3100,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: "pnpm dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
