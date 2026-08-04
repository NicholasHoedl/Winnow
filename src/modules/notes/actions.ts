"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  type ActionFailure,
  type ActionResult,
  invalid,
  nullify,
} from "@/lib/action-result"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"

import type { NoteRow } from "./queries"
import { restorableNote } from "./restore"
import { notes } from "./schema"
import { noteInputSchema, restoreNoteSchema } from "./validation"

/** See goals/actions.ts — every id crossing an RPC boundary is parsed, not annotated. */
const idSchema = z.string().uuid()

// Notes have their own page, and the dashboard shows today's journal entry.
function revalidateNotes() {
  revalidatePath("/notes")
  revalidateHubs()
}

/**
 * Postgres `unique_violation`. `notes_user_entry_date` is the only unique constraint on
 * the table, so a 23505 from these writes can only mean a second journal entry for one
 * day — which the UI's open-today path normally prevents, leaving the two-tab race and a
 * hand-edited date as the ways to get here.
 */
function isDuplicateEntryDate(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  )
}

const DUPLICATE_JOURNAL: ActionFailure = {
  ok: false,
  error: "You already have a journal entry for that day.",
  fieldErrors: { entryDate: "Already used" },
}

export async function createNote(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = noteInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, body, entryDate, pinned } = parsed.data
  try {
    await db.insert(notes).values({
      userId,
      title: nullify(title),
      body: body ?? "",
      entryDate: nullify(entryDate),
      pinned: pinned ?? false,
    })
  } catch (error) {
    if (isDuplicateEntryDate(error)) return DUPLICATE_JOURNAL
    throw error
  }
  revalidateNotes()
  return { ok: true }
}

export async function updateNote(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = noteInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, body, entryDate, pinned } = parsed.data
  try {
    await db
      .update(notes)
      .set({
        title: nullify(title),
        body: body ?? "",
        entryDate: nullify(entryDate),
        // Absent means "leave it alone" — the editor doesn't render a pin control for a
        // journal entry, so a partial form must not silently unpin a free-form note.
        ...(pinned === undefined ? {} : { pinned }),
      })
      .where(and(eq(notes.id, parsedId.data), eq(notes.userId, userId)))
  } catch (error) {
    if (isDuplicateEntryDate(error)) return DUPLICATE_JOURNAL
    throw error
  }
  revalidateNotes()
  return { ok: true }
}

export async function setNotePinned(
  id: unknown,
  pinned: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsedPinned = z.boolean().safeParse(pinned)
  if (!parsedPinned.success) return invalid(parsedPinned.error)

  await db
    .update(notes)
    .set({ pinned: parsedPinned.data })
    .where(and(eq(notes.id, parsedId.data), eq(notes.userId, userId)))
  revalidateNotes()
  return { ok: true }
}

export type DeleteNoteResult =
  { ok: true; note: NoteRow | null } | ActionFailure

export async function deleteNote(id: unknown): Promise<DeleteNoteResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(notes)
    .where(and(eq(notes.id, parsed.data), eq(notes.userId, userId)))
    .returning()
  revalidateNotes()
  return { ok: true, note: deleted ?? null }
}

/** Re-inserts a note removed via {@link deleteNote} (the "undo" path). */
export async function restoreNote(note: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreNoteSchema.safeParse(note)
  if (!parsed.success) return invalid(parsed.error)

  // onConflictDoNothing: if a new journal entry was written for that day while the toast
  // was up, the restore yields to it rather than throwing at the user.
  await db
    .insert(notes)
    .values(restorableNote(parsed.data, userId))
    .onConflictDoNothing()
  revalidateNotes()
  return { ok: true }
}
