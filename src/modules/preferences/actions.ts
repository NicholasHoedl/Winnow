"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { userPreferences } from "./schema"
import { userPreferencesSchema } from "./validation"

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

export async function setUserPreferences(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = userPreferencesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(userPreferences)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: parsed.data })

  // Timezone / week-start / currency / time-format affect rendering app-wide,
  // so revalidate everything under the root layout.
  revalidatePath("/", "layout")
  return { ok: true }
}
