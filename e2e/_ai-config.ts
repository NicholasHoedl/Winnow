import "dotenv/config"
import { Pool } from "pg"

/**
 * Where the setup stashes the real AI configuration so the teardown can put it back.
 *
 * Beside the saved session in `e2e/.auth/`, which is already gitignored — this is machine
 * state, not something to commit.
 */
export const AI_SETTINGS_BACKUP = "e2e/.auth/ai-settings.json"

/** What `ai.setup.ts` saves and `ai.teardown.ts` restores — the whole AI block. */
export type SavedAiSettings = {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  /** Empty string when the install has no key stored. */
  apiKey: string
}

/**
 * The AI settings, read and written straight into Postgres rather than through the page.
 *
 * **This is the third fix to the same wound, and the first one aimed at the cause.** The
 * suite runs against the PERSISTENT DEV DATABASE, so it has to borrow the real AI
 * configuration and give it back. Two earlier versions did that through `/settings`, and
 * both silently destroyed real data:
 *
 * 1. The teardown read the form before react-hook-form had populated it, got empty strings,
 *    and wrote them back over a working configuration.
 * 2. Fixing the teardown left the SETUP doing the same thing. `register()` sets no `value`
 *    attribute, so those inputs arrive empty from the server and are filled imperatively on
 *    mount; a `waitForAiFormReady` helper waited for that but SWALLOWED its timeout. On a
 *    slow dev server the wait expired, the setup captured `baseUrl: ""` and `model: ""` as
 *    "previous", and the teardown faithfully restored the emptiness. The tell was which
 *    fields survived: `enabled` and `provider` are server-rendered buttons and came back
 *    correct, while the two hydrated INPUTS came back blank — leaving `aiReady()` false, the
 *    nav tab gone, and a settings page that still read "On".
 *
 * The page was never the right instrument. It renders asynchronously, it is the thing under
 * test elsewhere, and it cannot return the API key at all by design. Postgres has none of
 * those problems, so the fixture goes around the UI entirely — no hydration to wait for, no
 * timeout to swallow, nothing to get half-right. `ai-settings.spec.ts` still covers the real
 * form; a fixture has no business being a second test of it.
 *
 * The tradeoff, stated plainly: the backup file holds the API key in clear text for the
 * duration of a run. That directory is gitignored and already holds a live session cookie,
 * and the key is already in clear text in this machine's own Postgres — the app's own
 * settings copy says so. The alternative is not "safer", it is "the key is deleted every
 * run", which is what actually happened before it was backed up.
 */
async function withDb<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

type ConfigRow = {
  ai_enabled: boolean
  ai_provider: string
  ai_base_url: string
  ai_model: string
  ai_api_key: string | null
}

export async function readAiConfig(): Promise<SavedAiSettings> {
  return withDb(async (pool) => {
    const { rows } = await pool.query<ConfigRow>(
      "select ai_enabled, ai_provider, ai_base_url, ai_model, ai_api_key from user_preferences limit 1",
    )
    const row = rows[0]
    return {
      enabled: row?.ai_enabled ?? false,
      provider: row?.ai_provider ?? "openai",
      baseUrl: row?.ai_base_url ?? "",
      model: row?.ai_model ?? "",
      apiKey: row?.ai_api_key ?? "",
    }
  })
}

/**
 * Everything except the key.
 *
 * Split the same way the app splits it — `setAiSettings` does not touch that column, and
 * neither does this — so a fixture pointing the suite at the stub cannot disturb a real
 * credential even by accident. Restoring the key is `writeApiKey`, called only by the
 * teardown.
 */
export async function writeAiConfig(
  settings: Omit<SavedAiSettings, "apiKey">,
): Promise<void> {
  await withDb(async (pool) => {
    await pool.query(
      "update user_preferences set ai_enabled = $1, ai_provider = $2, ai_base_url = $3, ai_model = $4",
      [settings.enabled, settings.provider, settings.baseUrl, settings.model],
    )
  })
}

export async function writeApiKey(key: string): Promise<void> {
  await withDb(async (pool) => {
    await pool.query("update user_preferences set ai_api_key = $1", [key])
  })
}
