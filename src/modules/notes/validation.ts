import { z } from "zod"

import { isValidDateString } from "@/lib/date"

const optionalDate = z
  .string()
  .refine((v) => v === "" || isValidDateString(v), "Enter a valid date")
  .optional()

/**
 * A note or journal entry. `entryDate` is what makes it the latter — set it and the
 * (user, date) unique constraint allows exactly one per day.
 *
 * The body cap is generous because a journal entry is the one place in this app someone
 * writes at length; it exists to bound a hostile POST, not to shape what gets written.
 */
export const noteInputSchema = z
  .object({
    title: z.string().trim().max(200).or(z.literal("")).optional(),
    body: z.string().trim().max(20_000).or(z.literal("")).optional(),
    entryDate: optionalDate,
    pinned: z.boolean().optional(),
  })
  .refine(
    (v) =>
      (v.title ?? "").trim().length > 0 || (v.body ?? "").trim().length > 0,
    {
      // Without this a blank submit writes an empty row that renders as
      // "Untitled note" and can only be found by deleting it.
      message: "Add a title or some text",
      path: ["body"],
    },
  )
export type NoteInput = z.infer<typeof noteInputSchema>

/**
 * The undo payload for a deleted note. `restoreNote` is a Server Action, which makes it
 * a public RPC endpoint — a `note: NoteRow` parameter is a compile-time annotation and
 * guards nothing at runtime.
 *
 * `userId` is deliberately absent: the session supplies it, and z.object() strips unknown
 * keys, so a client-supplied one can never reach the insert. The body is NOT trimmed
 * here — this round-trips a stored value rather than accepting new input.
 */
export const restoreNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).nullable(),
  body: z.string().max(20_000),
  entryDate: z
    .string()
    .refine((v) => isValidDateString(v), "Invalid date")
    .nullable(),
  pinned: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
