import "server-only"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as coreSchema from "./schema"
import * as todosSchema from "@/modules/todos/schema"
import * as mealsSchema from "@/modules/meals/schema"
import * as budgetSchema from "@/modules/budget/schema"

// Each domain module contributes its tables; merge them into one schema object
// so the Drizzle client's relational queries (db.query.*) see everything.
const schema = {
  ...coreSchema,
  ...todosSchema,
  ...mealsSchema,
  ...budgetSchema,
}

// Reuse a single Pool across dev HMR reloads to avoid exhausting Postgres
// connections (a new module instance is created on every hot reload otherwise).
const globalForDb = globalThis as unknown as { pool?: Pool }

const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export const db = drizzle(pool, { schema })
