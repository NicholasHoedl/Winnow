import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

const baseURL = "http://localhost:3000"

// Serial, single-worker: the specs share one single-user Postgres and create /
// clean their own data, so parallelism would race. Reuses a running dev server.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // One retry — and the reason this is not a cover-up: Playwright reports a test that
  // passed on retry as FLAKY, separately from passed. Nothing is hidden, it is labelled.
  // The discipline that keeps it honest: **a non-zero flaky count is a triage item, not a
  // green run.**
  //
  // Justified only now that the four real causes are fixed. Retrying before that would have
  // silently buried three genuine bugs — a form that wiped itself on revalidation, a toast
  // that covered an open menu, and a spec that deleted a stored credential. What remains is
  // irreducible from the test side: a dev server whose main route varies 2x between
  // identical consecutive requests cannot be made deterministic by the caller.
  retries: 1,
  reporter: "line",
  // 60s, not 30s — and this is a liveness bound, not an assertion, so raising it weakens
  // nothing. `expect.timeout` below is what catches a regression and stays at 10s.
  //
  // Measured: `/activity` costs 1.7–3.4s per render in dev with >2x jitter between
  // identical consecutive requests, and a dozen specs habitually ran at 80–100% of a 30s
  // budget. That is the mechanism behind "one test fails per run, a different one each
  // time" — a jitter spike on the app's most expensive route decided which spec died.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // `retain-on-failure`, NOT `on-first-retry`. This suite ran for its entire history with
  // `on-first-retry` AND `retries: 0`, a combination that can never fire — so it had never
  // once produced a trace, and every flake in it was diagnosed blind off a single
  // line-reporter line. `retain-on-failure` keeps this correct whatever `retries` becomes:
  // it captures a hard failure at zero retries and a failed first attempt at one.
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // A second setup pass, after auth because it needs the session: the companion's
    // configuration lives in the database now (T11), so the suite writes the stub's
    // details through the settings page before any spec runs.
    {
      name: "ai-setup",
      testMatch: /ai\.setup\.ts/,
      // Runs once the dependent projects finish. It is not optional: the setup repoints
      // this account at the stub, and the suite shares the DEV database with whoever uses
      // this machine — without the restore they are left with a companion dialling a port
      // that only exists during a test run.
      teardown: "ai-teardown",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "ai-teardown",
      testMatch: /ai\.teardown\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
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
