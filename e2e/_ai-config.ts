import "dotenv/config"
import { type Page, type Locator } from "@playwright/test"
import { Pool } from "pg"

/**
 * Where the setup stashes the real AI configuration so the teardown can put it back.
 *
 * Beside the saved session in `e2e/.auth/`, which is already gitignored — this is machine
 * state, not something to commit.
 */
export const AI_SETTINGS_BACKUP = "e2e/.auth/ai-settings.json"

/** What `ai.setup.ts` saves and `ai.teardown.ts` restores — including the API key. */
export type SavedAiSettings = {
  enabled: boolean
  anthropic: boolean
  baseUrl: string
  model: string
  /** Empty string when the install has no key stored. See `readApiKey`. */
  apiKey: string
}

/**
 * The API key, read and written at the DATABASE level rather than through the page.
 *
 * This exists because an earlier version of these files asserted that "no part of the suite
 * can disturb the key", and that was simply wrong. `e2e/ai-settings.spec.ts` writes the key
 * column and its `afterEach` clears it — so a full run DESTROYED whatever real key was
 * stored, permanently. It then passed on every subsequent run, because the state that made
 * it fail was gone. That is what made it look like flakiness rather than a bug.
 *
 * Restoring through the page is impossible by design: the field is write-only and the app
 * only ever renders a masked hint, which is a property worth keeping. Postgres has no such
 * restriction, so the backup goes around the UI instead of through it.
 *
 * The tradeoff, stated plainly: this writes the key in clear text to
 * `e2e/.auth/ai-settings.json` for the duration of a run. That directory is gitignored and
 * already holds a live session cookie, and the key is already stored in clear text in this
 * machine's own Postgres — the app's own settings copy says so. The alternative is not
 * "safer", it is "the key is deleted every run", which is what actually happened.
 */
async function withDb<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

export async function readApiKey(): Promise<string> {
  return withDb(async (pool) => {
    const { rows } = await pool.query<{ ai_api_key: string | null }>(
      "select ai_api_key from user_preferences limit 1",
    )
    return rows[0]?.ai_api_key ?? ""
  })
}

export async function writeApiKey(key: string): Promise<void> {
  await withDb(async (pool) => {
    await pool.query("update user_preferences set ai_api_key = $1", [key])
  })
}

/**
 * The AI block on `/settings`.
 *
 * By its heading rather than a testid: the settings page is a list of `<section>`s that all
 * look alike, and the heading is the thing a reader would use to find it too.
 */
export function aiSection(page: Page): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "AI companion" }) })
}

/**
 * Wait until react-hook-form has populated the AI form.
 *
 * Load-bearing, and not obvious: `register()` returns `{name, onChange, onBlur, ref}` and
 * sets NO value attribute, so the server-rendered inputs arrive EMPTY and are filled
 * imperatively on mount. Reading before that returns "" for settings that exist, and
 * filling before it writes to a DOM node react-hook-form is not yet listening to — so the
 * subsequent save submits the form's own (empty) defaults instead.
 *
 * Both happened: the teardown read empty values and then wrote them back, blanking a real
 * configuration. Waiting for the button to be enabled did not help, because the
 * server-rendered button is already enabled.
 *
 * A non-empty Base URL is the signal. When the install genuinely has none there is nothing
 * to wait for and nothing to lose, so the timeout is swallowed rather than failing.
 */
export async function waitForAiFormReady(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector<HTMLInputElement>("#ai-base-url")
        return !!el && el.value.length > 0
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {})
}
