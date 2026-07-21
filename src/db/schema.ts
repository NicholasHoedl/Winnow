import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// Core tables. Every domain table (added in later phases) also carries a
// `user_id` foreign key per ARCHITECTURE.md §3 — even though v1 is single-user.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
