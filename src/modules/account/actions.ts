"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

import { db } from "@/db"
import { users } from "@/db/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { unstable_update as updateSession } from "@/lib/auth"

import { deleteAllUserRows } from "./clear"
import { parseImport, toInsertRow } from "./import"
import { INSERT_ORDER } from "./tables"
import { changePasswordSchema, profileSchema } from "./validation"

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(users)
    .set({ displayName: parsed.data.displayName })
    .where(eq(users.id, userId))

  // The name is baked into the JWT at login; refresh it so the sidebar +
  // greeting update without a re-login (see auth.config.ts jwt callback).
  await updateSession({ user: { name: parsed.data.displayName } })
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) return { ok: false, error: "Account not found." }

  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  )
  if (!valid) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: { currentPassword: "Current password is incorrect." },
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  // JWT sessions aren't tied to the hash, so the current session stays valid —
  // no forced sign-out needed for a single-user app.
  return { ok: true }
}

/**
 * Replace everything the user owns with the contents of a backup file.
 *
 * The single most destructive thing the app can do, so the order is deliberate:
 *
 * 1. **Validate first, entirely.** `parseImport` judges the whole file — version, shape,
 *    and that every foreign key resolves inside the payload — before a row is deleted.
 *    A file that is wrong should cost nothing.
 * 2. **Clear and insert in ONE transaction.** `clearAllData` has a transaction of its
 *    own, so calling it would open a window where the wipe has committed and the restore
 *    has not. Anything that fails after that point leaves an empty account.
 * 3. **Insert in `INSERT_ORDER`**, a topological sort of the foreign-key graph, so a
 *    row's target always exists by the time it arrives.
 *
 * No `onConflictDoNothing`. Elsewhere in the app that is right — an undo racing a real
 * insert should lose quietly. Here the table was empty a moment ago, so a conflict means
 * the file contradicts itself, and swallowing it would silently drop rows from a restore.
 */
export async function importUserData(payload: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = parseImport(payload)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  // Carried across the wipe (T11). The API key is excluded from the export, and excluded
  // has to mean UNTOUCHED in both directions — a backup that cannot contain your key must
  // not be able to delete it either. Without this, restoring any backup silently signs you
  // out of the AI provider, which would read as the companion breaking for no reason.
  const existingKey = (
    await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
      columns: { aiApiKey: true },
    })
  )?.aiApiKey

  try {
    await db.transaction(async (tx) => {
      await deleteAllUserRows(tx, userId)
      for (const table of INSERT_ORDER) {
        const rows = parsed.data.tables[table.key]
        if (rows.length === 0) continue
        await tx
          .insert(table.table)
          .values(rows.map((row) => toInsertRow(table, row, userId)))
      }
      if (existingKey) {
        // `updatedAt` is set EXPLICITLY, and that is the whole point of the line.
        //
        // The column carries `$onUpdate(() => new Date())`, which fires on this upsert's
        // update branch and restamps the row to the moment of the restore. That quietly
        // contradicts what a restore is: `toInsertRow` deliberately keeps `id`,
        // `createdAt` and `updatedAt` from the file, because "putting back the row that
        // was" and "re-creating it now" are different things. This write exists only to
        // carry the API key across the wipe and has no business changing anything else.
        //
        // It was invisible because it only happens when an API key is STORED, and
        // `import.spec.ts`'s round-trip runs after `ai-settings.spec.ts`, whose afterEach
        // clears the key — so the branch was skipped in a full run and the test passed.
        // Run that spec on its own with a real key and it fails, as it always would have.
        const restored = parsed.data.tables.preferences?.[0]?.updatedAt
        await tx
          .insert(userPreferences)
          .values({ userId, aiApiKey: existingKey })
          .onConflictDoUpdate({
            target: userPreferences.userId,
            set: {
              aiApiKey: existingKey,
              // A backup predating the column, or one with no preferences row at all,
              // has nothing to restore — then stamping now is the honest answer.
              updatedAt:
                typeof restored === "string" ? new Date(restored) : new Date(),
            },
          })
      }
    })
  } catch {
    // `parseImport` judges the file's shape and its links; the database judges the
    // values, and it gets the last word — a missing NOT NULL column, a date that isn't
    // one, two rows sharing an id. Those reach the insert.
    //
    // The transaction already protects the DATA. This protects the person: without it a
    // rejected row escapes as an unhandled rejection and the settings page is replaced
    // by an error boundary, which looks exactly like a restore that destroyed everything
    // — at the one moment they can least afford to guess.
    return {
      ok: false,
      error:
        "That backup couldn't be restored — some of its records are invalid.",
    }
  }
  revalidatePath("/", "layout")
  return { ok: true }
}

// Wipe every domain row for the user (keeping the account). The list itself lives in
// `clear.ts` because a restore needs the same twenty deletes inside its own transaction,
// and two copies of that list is the bug `coverage.test.ts` exists to catch.
export async function clearAllData(): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.transaction(async (tx) => {
    await deleteAllUserRows(tx, userId)
  })
  revalidatePath("/", "layout")
  return { ok: true }
}
