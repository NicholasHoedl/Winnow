import "server-only"
import { and, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { notes } from "./schema"

export type NoteRow = typeof notes.$inferSelect

/** Every note, most recently touched first — the order `notes_user_updated` indexes. */
export async function getNotes(): Promise<NoteRow[]> {
  const userId = await requireUserId()
  return db.query.notes.findMany({
    where: eq(notes.userId, userId),
    orderBy: [desc(notes.updatedAt)],
  })
}

/**
 * That day's journal entry, or null. Backs both the dashboard card and the editor's
 * open-today path, which needs to know whether it is creating or editing before the
 * unique constraint tells it the hard way.
 */
export async function getJournalEntry(
  entryDate: string,
): Promise<NoteRow | null> {
  const userId = await requireUserId()
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.entryDate, entryDate)))
    .limit(1)
  return row ?? null
}
