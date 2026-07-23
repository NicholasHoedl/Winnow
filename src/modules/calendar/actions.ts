"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import type { EventRow } from "./queries"
import { events, goals, milestones } from "./schema"
import { zonedDateTimeToUtc } from "./service"
import {
  eventInputSchema,
  goalInputSchema,
  milestoneInputSchema,
  type EventInput,
} from "./validation"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function invalid(error: z.ZodError): ActionResult {
  return {
    ok: false,
    error: "Please fix the errors below.",
    fieldErrors: fieldErrorsFrom(error),
  }
}

function nullify(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value
}

function revalidateCalendar() {
  revalidatePath("/calendar")
  revalidatePath("/")
}

// Assemble the timestamptz instants from the form's local date/time fields.
function toTimestamps(
  d: EventInput,
  tz: string,
): { startAt: Date; endAt: Date | null } {
  const startAt = zonedDateTimeToUtc(
    d.startDate,
    d.allDay ? "00:00" : d.startTime || "00:00",
    tz,
  )
  const hasEnd = !!d.endDate || (!d.allDay && !!d.endTime)
  const endAt = hasEnd
    ? zonedDateTimeToUtc(
        d.endDate || d.startDate,
        d.allDay ? "00:00" : d.endTime || d.startTime || "00:00",
        tz,
      )
    : null
  return { startAt, endAt }
}

export async function createEvent(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db.insert(events).values({
    userId,
    title: d.title,
    notes: nullify(d.notes),
    startAt,
    endAt,
    allDay: d.allDay,
    recurrenceFreq: d.recurrenceFreq,
    recurrenceInterval: d.recurrenceInterval,
    recurrenceWeekdays: d.recurrenceWeekdays,
    recurrenceMonthlyMode: d.recurrenceMonthlyMode,
    recurrenceEndDate: nullify(d.recurrenceEndDate),
  })
  revalidateCalendar()
  return { ok: true }
}

export async function updateEvent(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db
    .update(events)
    .set({
      title: d.title,
      notes: nullify(d.notes),
      startAt,
      endAt,
      allDay: d.allDay,
      recurrenceFreq: d.recurrenceFreq,
      recurrenceInterval: d.recurrenceInterval,
      recurrenceWeekdays: d.recurrenceWeekdays,
      recurrenceMonthlyMode: d.recurrenceMonthlyMode,
      recurrenceEndDate: nullify(d.recurrenceEndDate),
    })
    .where(and(eq(events.id, id), eq(events.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

export type DeleteEventResult =
  | { ok: true; event: EventRow | null }
  | { ok: false; error: string }

export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning()
  revalidateCalendar()
  return { ok: true, event: deleted ?? null }
}

export async function restoreEvent(ev: EventRow): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(events)
    .values({
      id: ev.id,
      userId,
      title: ev.title,
      notes: ev.notes,
      startAt: ev.startAt,
      endAt: ev.endAt,
      allDay: ev.allDay,
      recurrenceFreq: ev.recurrenceFreq,
      recurrenceInterval: ev.recurrenceInterval,
      recurrenceWeekdays: ev.recurrenceWeekdays,
      recurrenceMonthlyMode: ev.recurrenceMonthlyMode,
      recurrenceEndDate: ev.recurrenceEndDate,
      createdAt: ev.createdAt,
    })
    .onConflictDoNothing()
  revalidateCalendar()
  return { ok: true }
}

// --- Goals ---

export async function createGoal(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db.insert(goals).values({
    userId,
    title,
    notes: nullify(notes),
    targetDate: nullify(targetDate),
  })
  revalidatePath("/calendar")
  return { ok: true }
}

export async function updateGoal(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db
    .update(goals)
    .set({ title, notes: nullify(notes), targetDate: nullify(targetDate) })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

// --- Milestones ---

export async function addMilestone(
  goalId: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = milestoneInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(milestones)
    .values({ userId, goalId, title: parsed.data.title })
  revalidatePath("/calendar")
  return { ok: true }
}

export async function toggleMilestone(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .update(milestones)
    .set({ done })
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .delete(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}
