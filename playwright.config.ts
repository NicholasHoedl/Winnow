import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"

import { TEST_DATABASE_URL } from "./e2e/_test-db"

// Its own port, so this never attaches to the dev server you are using. 3000 is yours.
const baseURL = "http://localhost:3001"

// Serial, single-worker: the specs share one single-user Postgres and create /
// clean their own data, so parallelism would race.
//
// **The suite runs against `winnow_test`, not your database.** That was not true until
// T12g, and the reason is worth stating because it is not obvious from a config file: the
// app's `webServer` had `reuseExistingServer`, so Playwright ATTACHED to whatever dev
// server was already running — the one pointed at real data. Overriding `DATABASE_URL`
// here would not have helped, because the env of a server you did not start is not yours
// to set. So the server below is never reused, listens on its own port, and is handed the
// test connection string. See `e2e/_test-db.ts` for the derivation and its guard.
export default defineConfig({
  testDir: "./e2e",
  // Creates, migrates, empties and seeds `winnow_test` before anything runs.
  globalSetup: "./e2e/global-setup.ts",
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
      // The mobile sweep is excluded rather than allowed to run here too: at desktop width
      // its assertions pass trivially, so it would cost a second full pass over eleven
      // routes to prove nothing.
      testIgnore: /mobile-layout\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup", "ai-setup"],
    },
    /**
     * The only project that renders this app below 768px.
     *
     * WebKit, not Chromium wearing an iPhone user-agent: `devices["iPhone 15"]` carries
     * `defaultBrowserType: "webkit"`, which the runner honours — unlike `playwright open`,
     * where `--device` sets the viewport and `-b` still defaults to chromium. That
     * distinction is the whole value of the project; a Chromium run at 393px would miss
     * every Safari-specific layout difference.
     *
     * Depends on `ai-setup` as well as `setup`, and not for convenience: `/companion` 404s
     * unless the companion is configured, so without it one of the eleven routes would fail
     * on a missing `h1` and read as a layout fault.
     */
    {
      name: "mobile",
      testMatch: /mobile-layout\.spec\.ts/,
      use: {
        ...devices["iPhone 15"],
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
      // NEVER reused, unlike the dev server below. The stub is a source file pretending to
      // be a provider, and a long-lived process goes stale the moment that file is edited —
      // so the suite silently keeps asserting against the OLD canned payload while the new
      // one sits unread on disk. That cost a debugging round in T12c: three specs failed
      // against a stub still emitting the pre-T12c shape. It starts in milliseconds, so
      // reuse buys nothing and costs correctness.
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: "pnpm dev --port 3001",
      url: baseURL,
      // NEVER reused, and this is the whole safety property. Reuse meant attaching to a
      // server whose `DATABASE_URL` is the real one; the `env` below only reaches a
      // process Playwright started itself.
      reuseExistingServer: false,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        // Its own build output, so this server and yours do not fight over `.next`. Two
        // `next dev` processes sharing one dist directory race on the same artifacts.
        NEXT_DIST_DIR: ".next-e2e",
      },
      // Longer than the old 120s: this is a cold Turbopack start every time now, with no
      // warm `.next` to fall back on and no chance of a running server answering instantly.
      timeout: 180_000,
    },
  ],
})
