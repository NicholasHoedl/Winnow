import { execFileSync } from "node:child_process"
import { Client } from "pg"

import {
  TEST_DATABASE_URL,
  assertSafeToDestroy,
  maintenanceUrl,
  testDatabaseName,
} from "./_test-db"

/**
 * Build the database the suite is about to destroy, before any of it runs.
 *
 * Four steps, in this order because each needs the last: create the database if it is not
 * there, bring its schema up to date, empty it, then put the one account back.
 *
 * **The wipe is the point, not a nicety.** A suite that starts from a known-empty database
 * cannot depend on ambient rows, which is exactly the class of failure that took four specs
 * red in T12d — each asserting on events, transactions, categories or a task due today that
 * it never created. Those specs now seed their own data, and this makes that mandatory
 * rather than merely tidy: anything they forget to seed will not be there.
 *
 * Runs in the Playwright process before the tests, so it also runs for a bare
 * `npx playwright test` and not only through `pnpm test:e2e`.
 */
export default async function globalSetup() {
  assertSafeToDestroy()
  const name = testDatabaseName()

  // A connection cannot create the database it is connected to, so this one step talks to
  // `postgres` instead. `CREATE DATABASE` takes no parameters, hence the identifier is
  // quoted rather than bound — `name` is derived from DATABASE_URL and checked above.
  const admin = new Client({ connectionString: maintenanceUrl() })
  await admin.connect()
  try {
    const { rows } = await admin.query(
      "select 1 from pg_database where datname = $1",
      [name],
    )
    if (rows.length === 0) {
      console.log(`[e2e] creating database "${name}"`)
      await admin.query(`create database "${name}"`)
    }
  } finally {
    await admin.end()
  }

  // The same migrator the app uses, against the test URL. Shelling out rather than calling
  // drizzle's migrator directly so there is exactly one migration path in this repo — if it
  // works here it works on a deploy, and if it breaks it breaks in both.
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL }
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    env,
    stdio: "inherit",
    shell: true,
  })

  const db = new Client({ connectionString: TEST_DATABASE_URL })
  await db.connect()
  try {
    // Every table in `public`. Drizzle keeps its migration ledger in its own `drizzle`
    // schema, so it is out of range here — which is what lets this truncate everything it
    // finds rather than carrying a list that would fall behind the schema.
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    )
    if (rows.length > 0) {
      const list = rows.map((row) => `"${row.tablename}"`).join(", ")
      await db.query(`truncate table ${list} restart identity cascade`)
    }
  } finally {
    await db.end()
  }

  // Truncating took the account with it, so put it back. `signIn` in `_login.ts` uses the
  // same SEED_USER_* env vars, which is what makes `auth.setup.ts` able to log in at all.
  execFileSync("npx", ["tsx", "scripts/seed-user.ts"], {
    env,
    stdio: "inherit",
    shell: true,
  })

  console.log(`[e2e] ready: ${name}, migrated, emptied and seeded`)
}
