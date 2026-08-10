import { test as teardown, expect } from "@playwright/test"
import { existsSync, readFileSync, rmSync } from "node:fs"

import {
  AI_SETTINGS_BACKUP,
  aiSection,
  readApiKey,
  waitForAiFormReady,
  writeApiKey,
  type SavedAiSettings,
} from "./_ai-config"

/**
 * Put the real AI configuration back after the suite.
 *
 * `ai.setup.ts` repoints this account at the local stub, and this runs against the
 * PERSISTENT DEV DATABASE — so without this the machine's owner is left with a companion
 * dialling `127.0.0.1:3100`, a port that only exists while Playwright is running. That
 * happened, and it presented as "I added my API key and nothing works": the key was fine,
 * the settings page looked configured, and every generation failed to reach a provider.
 *
 * The API key IS part of this, and has to be. An earlier version left it out on the theory
 * that nothing in the suite could disturb it; `e2e/ai-settings.spec.ts` disturbs it on every
 * run — it saves a test key and its `afterEach` removes it — and a real key was destroyed
 * that way. It cannot be restored through the page, which is write-only by design, so it is
 * restored straight into Postgres. See `readApiKey` in `_ai-config.ts`.
 */
teardown("restore the real AI settings", async ({ page }) => {
  if (!existsSync(AI_SETTINGS_BACKUP)) return

  const saved = JSON.parse(
    readFileSync(AI_SETTINGS_BACKUP, "utf-8"),
  ) as SavedAiSettings

  await page.goto("/settings")
  const ai = aiSection(page)
  await waitForAiFormReady(page)

  await ai
    .getByRole("button", { name: saved.enabled ? "On" : "Off", exact: true })
    .click()
  await ai
    .getByRole("button", {
      name: saved.anthropic ? "Anthropic" : "OpenAI-compatible",
      exact: true,
    })
    .click()
  await ai.getByLabel("Base URL").fill(saved.baseUrl)
  await ai.getByLabel("Model", { exact: true }).fill(saved.model)
  await ai.getByRole("button", { name: "Save AI settings" }).click()
  await expect(page.getByText("AI settings saved")).toBeVisible()

  // Read it back rather than trusting the toast: this is the last thing that runs, so a
  // silent failure here is one nobody would see until the companion stopped working.
  await page.reload()
  await waitForAiFormReady(page)
  await expect(ai.getByLabel("Base URL")).toHaveValue(saved.baseUrl)
  await expect(ai.getByLabel("Model", { exact: true })).toHaveValue(saved.model)

  // Put the key back last. Guarded on the property rather than defaulted to "": a backup
  // written before the key was part of this format has no `apiKey` field, and blanking the
  // column on the strength of a missing key would recreate the exact bug this fixes.
  if (typeof saved.apiKey === "string") {
    await writeApiKey(saved.apiKey)
    // Verified by length, never by value — this file must not be able to print the key.
    expect(await readApiKey()).toHaveLength(saved.apiKey.length)
  }

  rmSync(AI_SETTINGS_BACKUP, { force: true })
})
