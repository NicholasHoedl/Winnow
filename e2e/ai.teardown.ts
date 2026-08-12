import { test as teardown, expect } from "@playwright/test"
import { existsSync, readFileSync, rmSync } from "node:fs"

import {
  AI_SETTINGS_BACKUP,
  readAiConfig,
  writeAiConfig,
  writeApiKey,
  type SavedAiSettings,
} from "./_ai-config"

/**
 * Put the real AI configuration back after the suite.
 *
 * `ai.setup.ts` repoints the test account at the local stub. Since T12g that account lives
 * in `winnow_test`, which is emptied before every run, so this restore no longer protects
 * anything of the owner's — it is kept because it is the only thing asserting the setup
 * actually wrote what it meant to, and because the day someone points the suite back at a
 * real database is the day its absence would matter.
 *
 * It used to matter directly: without it the machine's owner was left with a companion
 * dialling `127.0.0.1:3100`, a port that only exists while Playwright is running. That
 * happened, and it presented as "I added my API key and nothing works".
 *
 * The API key is part of this and has to be: `ai-settings.spec.ts` saves a test key and its
 * `afterEach` removes it, so every run disturbs that column. A real key was destroyed that
 * way once.
 *
 * Restoring goes straight into Postgres rather than through the settings form. That form
 * cannot return the key at all (it is write-only by design), and reading it for the other
 * fields caused two separate silent data losses — the second of which left `ai_base_url` and
 * `ai_model` blank, `aiReady()` false, and the companion's nav tab simply gone while the
 * settings page still read "On". See `_ai-config.ts`.
 */
teardown("restore the real AI settings", async () => {
  if (!existsSync(AI_SETTINGS_BACKUP)) return

  const saved = JSON.parse(
    readFileSync(AI_SETTINGS_BACKUP, "utf-8"),
  ) as SavedAiSettings

  await writeAiConfig({
    enabled: saved.enabled,
    provider: saved.provider,
    baseUrl: saved.baseUrl,
    model: saved.model,
  })

  // Guarded on the property rather than defaulted to "": a backup written before the key was
  // part of this format has no `apiKey` field, and blanking the column on the strength of a
  // missing key would recreate the exact bug this exists to prevent.
  if (typeof saved.apiKey === "string") {
    await writeApiKey(saved.apiKey)
  }

  // Read back rather than trusting the writes: this is the last thing that runs, so a silent
  // failure here is one nobody would see until the companion stopped working — which is
  // precisely how the previous two versions of this file failed. The key is checked by
  // LENGTH, never by value, so this file cannot print a credential.
  const restored = await readAiConfig()
  expect(restored.baseUrl).toBe(saved.baseUrl)
  expect(restored.model).toBe(saved.model)
  expect(restored.provider).toBe(saved.provider)
  expect(restored.enabled).toBe(saved.enabled)
  expect(restored.apiKey).toHaveLength(saved.apiKey?.length ?? 0)

  rmSync(AI_SETTINGS_BACKUP, { force: true })
})
