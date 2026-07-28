import { test, expect } from "@playwright/test"
import { is } from "drizzle-orm"
import { PgTable, getTableConfig } from "drizzle-orm/pg-core"

import * as budgetSchema from "../src/modules/budget/schema"
import * as calendarSchema from "../src/modules/calendar/schema"
import * as goalsSchema from "../src/modules/goals/schema"
import * as mealsSchema from "../src/modules/meals/schema"
import * as preferencesSchema from "../src/modules/preferences/schema"
import * as todosSchema from "../src/modules/todos/schema"
import { exportKeyFor } from "../src/modules/account/payload"

// `src/modules/account/coverage.test.ts` guards the same invariant, but it can only read
// SOURCE TEXT — both account functions are `server-only` and open a DB connection, so a
// unit test cannot call them. That leaves one thing it can't answer: whether the export
// actually SERVES those keys. A findMany that throws, a key renamed in the response, a
// route that regresses — all invisible to a source scan.
//
// This closes that half by fetching the real endpoint with the real session and checking
// the payload. It is read-only: it creates nothing and cleans nothing up.
//
// It deliberately derives the expected keys from the schema rather than listing them, so a
// table added later is covered here the same way it is in the unit guard.

const SCHEMAS = [
  budgetSchema,
  calendarSchema,
  goalsSchema,
  mealsSchema,
  preferencesSchema,
  todosSchema,
]

function expectedKeys(): string[] {
  const keys: string[] = []
  for (const schema of SCHEMAS) {
    for (const [name, value] of Object.entries(schema)) {
      if (!is(value, PgTable)) continue
      const config = getTableConfig(value)
      if (!config.columns.some((column) => column.name === "user_id")) continue
      keys.push(exportKeyFor(name))
    }
  }
  return [...new Set(keys)].sort()
}

test("the export serves every user-owned table", async ({ page }) => {
  const response = await page.request.get("/settings/export")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("application/json")

  const body = await response.json()
  const keys = expectedKeys()

  // Guard against a vacuous pass if the duck-typing above ever stops matching.
  expect(keys.length).toBeGreaterThanOrEqual(20)
  expect(keys).toContain("subtasks")
  expect(keys).toContain("taskRecurrenceExceptions")

  for (const key of keys) {
    expect(body, `export is missing "${key}"`).toHaveProperty(key)
  }
})
