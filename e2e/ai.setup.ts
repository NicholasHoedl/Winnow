import { test as setup, expect } from "@playwright/test"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { AI_SETTINGS_BACKUP, readAiConfig, writeAiConfig } from "./_ai-config"

/**
 * Point the companion at the local stub — after saving whatever was there.
 *
 * Until T11 this came from `.env`, which both `pnpm dev` and Playwright read. The AI_* env
 * vars are gone, so the suite has to write the configuration into `user_preferences` itself.
 *
 * **This used to say the suite shares the persistent dev database, and that stopped being
 * true at T12g** — it writes to `winnow_test`, which `global-setup.ts` empties and reseeds
 * before every run, so nothing here can reach the owner's real configuration. The backup
 * and `ai.teardown.ts` are kept anyway, and deliberately: the restore is the only thing
 * asserting this setup wrote what it meant to, `ai-settings.spec.ts` clears the API key
 * unconditionally and says "do not remove that teardown" for that reason, and the day
 * someone points the suite back at a real database is the day its absence would matter.
 * `ai.teardown.ts`'s own docstring carries the same reasoning; this one had simply fallen
 * behind it.
 *
 * Both halves now go through Postgres rather than the settings page. Reading the form was
 * the cause of two separate data losses — see the long note in `_ai-config.ts`, which is
 * worth reading before anyone is tempted to make this fixture "more realistic" by driving
 * the UI again. The UI is covered by `ai-settings.spec.ts`; a fixture has no business being
 * a second test of it.
 */
setup("configure the AI stub", async ({ page }) => {
  // Written ONLY when there is no backup already, and that guard is load-bearing. A run
  // killed between here and the teardown — Ctrl-C, a crash, a machine that slept — leaves
  // the account pointing at the stub AND the backup on disk. Without the guard the next run
  // would read those stub values as "previous" and write them over the only record of the
  // real configuration.
  //
  // The teardown deletes the file on success, so in normal operation this always writes.
  mkdirSync(dirname(AI_SETTINGS_BACKUP), { recursive: true })
  if (!existsSync(AI_SETTINGS_BACKUP)) {
    const previous = await readAiConfig()
    writeFileSync(AI_SETTINGS_BACKUP, JSON.stringify(previous, null, 2))
  }

  // The API key is deliberately not passed: `writeAiConfig` does not touch that column, so
  // pointing the suite at the stub cannot disturb a real credential.
  // `custom`, not `openai` — and the distinction is now load-bearing rather than cosmetic.
  // T12h resolves the base URL from the provider when settings are SAVED, and `openai`
  // resolves to api.openai.com. Nothing here goes through that path (this writes the
  // columns directly), so the stub URL would survive either way — but naming the endpoint
  // for what it is means a future change that starts resolving on read cannot quietly
  // point the whole suite at a paid API.
  await writeAiConfig({
    enabled: true,
    provider: "custom",
    baseUrl: "http://127.0.0.1:3100",
    model: "stub",
  })

  // Proven by its effect, not by a toast: a tool panel only renders once `aiReady` is
  // satisfied, and that is what every companion spec depends on. It is also the check that
  // would have caught both historic failures on the way IN rather than on the way out — a
  // blank base URL fails here, loudly, instead of surfacing days later as a tool that had
  // quietly stopped rendering.
  //
  // `/activity/routines` rather than `/companion`, which T13 deleted. Any of the four tool
  // pages would do; this one is the cheapest to render — no goals to load, no month of
  // transactions, no weekly aggregation — and its panel is unconditional beyond `aiReady`,
  // unlike the plan tool, which also needs a goal to exist.
  //
  // `domcontentloaded` and a generous timeout because this is the FIRST hit on the route in
  // the run, and Turbopack compiles on demand — the default `load` waits for every
  // subresource of a page being built from scratch, which overran 30s and failed the setup
  // for a reason that had nothing to do with the settings it had just saved.
  await page.goto("/activity/routines", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  // The same cold-compile budget the `goto` above is given, and for the same reason — this
  // assertion lands on a route Turbopack has just built from scratch, and the default 10s is
  // not a compile budget. Observed failing twice in a row on a cold `.next-e2e`, which is
  // expensive out of all proportion: this fixture gates every project, so it does not fail
  // one spec, it fails the run.
  await expect(
    page.getByRole("heading", { name: "Build a routine" }).first(),
  ).toBeVisible({ timeout: 60_000 })
})
