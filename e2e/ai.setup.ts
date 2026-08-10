import { test as setup, expect, type Page } from "@playwright/test"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import {
  AI_SETTINGS_BACKUP,
  aiSection,
  readApiKey,
  waitForAiFormReady,
} from "./_ai-config"

/**
 * Point the companion at the local stub — after saving whatever was there.
 *
 * Until T11 this came from `.env`, which both `pnpm dev` and Playwright read. The AI_*
 * env vars are gone, so the suite has to write the configuration into `user_preferences`
 * itself. That is the whole reason `ai.teardown.ts` exists: this suite runs against the
 * PERSISTENT DEV DATABASE, so writing the stub's details here overwrites the real
 * configuration of whoever uses this machine.
 *
 * It did exactly that, once, and the failure was completely silent: the settings page still
 * showed a saved key, the nav tab was still there, and every generation failed with "can't
 * reach the AI provider" because the app was dialling a stub on port 3100 that only exists
 * while Playwright is running. Nothing pointed at the cause.
 *
 * An earlier version of this comment claimed the API KEY was never touched by the suite,
 * on the reasoning that `setAiSettings` does not write that column. That was wrong, and
 * expensively so: `e2e/ai-settings.spec.ts` writes the key column directly and its
 * `afterEach` clears it, so a full run silently destroyed the real key — then passed every
 * time afterwards, because the state that made it fail no longer existed. The key is now
 * backed up and restored too, at the database level rather than through the write-only
 * form. See `readApiKey` in `_ai-config.ts` for why, and for what that costs.
 */
async function readSettings(page: Page) {
  const ai = aiSection(page)
  const pressed = async (name: string) =>
    (await ai
      .getByRole("button", { name, exact: true })
      .getAttribute("aria-pressed")) === "true"
  return {
    enabled: await pressed("On"),
    anthropic: await pressed("Anthropic"),
    baseUrl: (await ai.getByLabel("Base URL").inputValue()) ?? "",
    model: (await ai.getByLabel("Model", { exact: true }).inputValue()) ?? "",
  }
}

setup("configure the AI stub", async ({ page }) => {
  await page.goto("/settings")
  await waitForAiFormReady(page)

  // Written ONLY when there is no backup already, and that guard is load-bearing. A run
  // killed between here and the teardown — Ctrl-C, a crash, a machine that slept — leaves
  // the account pointing at the stub AND the backup file on disk. Without the guard the
  // next run would read those stub values as "previous" and write them over the only
  // record of the real configuration, which is then unrecoverable: the page renders the
  // key as a masked hint and never gives the model or base URL back once overwritten.
  //
  // The teardown deletes the file on success, so in normal operation this always writes.
  // The cost is narrow and worth paying: if the settings genuinely changed while a stale
  // backup sat there, the teardown restores the older values — recoverable by hand, unlike
  // the alternative.
  mkdirSync(dirname(AI_SETTINGS_BACKUP), { recursive: true })
  if (!existsSync(AI_SETTINGS_BACKUP)) {
    const previous = await readSettings(page)
    const apiKey = await readApiKey()
    writeFileSync(
      AI_SETTINGS_BACKUP,
      JSON.stringify({ ...previous, apiKey }, null, 2),
    )
  }

  const ai = aiSection(page)
  await ai.getByRole("button", { name: "On", exact: true }).click()
  await ai
    .getByRole("button", { name: "OpenAI-compatible", exact: true })
    .click()
  await ai.getByLabel("Base URL").fill("http://127.0.0.1:3100")
  await ai.getByLabel("Model", { exact: true }).fill("stub")
  await ai.getByRole("button", { name: "Save AI settings" }).click()
  await expect(page.getByText("AI settings saved")).toBeVisible()

  // Proven by its effect, not by the toast: the companion is only actually reachable once
  // `aiReady` is satisfied, and that is what every companion spec depends on.
  //
  // `domcontentloaded` and a generous timeout because this is the FIRST hit on `/companion`
  // in the run, and Turbopack compiles a route on demand — the default `load` waits for
  // every subresource of a page being built from scratch, which overran 30s and failed the
  // setup for a reason that had nothing to do with the settings it had just saved.
  await page.goto("/companion", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  await expect(
    page.getByRole("heading", { name: "Companion" }).first(),
  ).toBeVisible()
})
