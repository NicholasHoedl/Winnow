import "dotenv/config"
import { Client } from "pg"

/**
 * The database the e2e suite is allowed to destroy.
 *
 * Until T12g the suite ran against whatever `DATABASE_URL` pointed at, which on this
 * machine is the real one — and `playwright.config.ts` reused an already-running dev
 * server, so even overriding the env would not have reached it. Every full run was a write
 * to real data. It deleted an API key once, repointed the companion at a dead port once,
 * and twice left user rows unaccounted for.
 *
 * Derived from `DATABASE_URL` rather than configured separately, deliberately: a second
 * connection string in `.env` is a second thing to keep in step, and the one time it drifts
 * is the time the suite is pointed back at real data without anyone noticing.
 */
function derive(): string {
  const raw = process.env.DATABASE_URL
  if (!raw)
    throw new Error("DATABASE_URL must be set to derive the test database.")

  const url = new URL(raw)
  const source = url.pathname.replace(/^\//, "")
  if (!source)
    throw new Error(`DATABASE_URL names no database: ${url.pathname}`)

  url.pathname = `/${source}_test`
  return url.toString()
}

export const TEST_DATABASE_URL = derive()

export function testDatabaseName(): string {
  return new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "")
}

/**
 * A connection to the `postgres` maintenance database, for `CREATE DATABASE`.
 *
 * You cannot create a database from inside a connection to it, so this is the one place
 * that connects somewhere other than the test database.
 */
export function maintenanceUrl(): string {
  const url = new URL(TEST_DATABASE_URL)
  url.pathname = "/postgres"
  return url.toString()
}

/**
 * The last line of defence, called before anything destructive.
 *
 * Everything above is derivation, and derivation can be wrong — a `.env` edit, a stray
 * `DATABASE_URL` in the shell, a copy-paste. This asserts the NAME rather than trusting the
 * construction: if the target is not `<something>_test`, nothing runs. A suite that refuses
 * to start is a much better failure than one that wipes the wrong database.
 */
export function assertSafeToDestroy(): void {
  const name = testDatabaseName()
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run: the e2e database is "${name}", which does not end in "_test". ` +
        `Check DATABASE_URL.`,
    )
  }
  if (TEST_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error(
      "Refusing to run: the e2e database and DATABASE_URL are the same connection string.",
    )
  }
}

/**
 * Run something against the test database, with the safety rail in front of it.
 *
 * Exists so that `assertSafeToDestroy` is called by CONSTRUCTION rather than by each
 * caller remembering to. The rail is the only thing standing between a fixture sweep and
 * the real database if `DATABASE_URL` is ever edited badly, and a check you have to
 * remember is a check that eventually is not made.
 *
 * A connection per call, deliberately: teardown runs a handful of times per spec and a
 * pool would be a lifecycle to manage — one that Playwright's worker teardown gives no
 * obvious place to close.
 */
export async function withTestDb<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  assertSafeToDestroy()
  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}
