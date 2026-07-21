import "dotenv/config"
import bcrypt from "bcryptjs"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq } from "drizzle-orm"
import { Pool } from "pg"

import { users } from "../src/db/schema"

// Seeds (or updates) the single Winnow account from env vars. There is no
// public sign-up flow — this script is the only way an account is created.
async function main() {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const name = process.env.SEED_USER_NAME ?? "User"

  if (!email || !password) {
    throw new Error(
      "SEED_USER_EMAIL and SEED_USER_PASSWORD must be set in .env",
    )
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema: { users } })

  const normalizedEmail = email.toLowerCase()
  const passwordHash = await bcrypt.hash(password, 12)

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  })

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, displayName: name })
      .where(eq(users.email, normalizedEmail))
    console.log(`Updated existing user: ${normalizedEmail}`)
  } else {
    await db.insert(users).values({
      email: normalizedEmail,
      passwordHash,
      displayName: name,
    })
    console.log(`Created user: ${normalizedEmail}`)
  }

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
