import { type ZodError } from "zod"

// Shared Server Action result shape + the helpers every module's actions file uses.

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** First error message per top-level field path — for surfacing Zod issues on fields. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export function invalid(error: ZodError): ActionResult {
  return {
    ok: false,
    error: "Please fix the errors below.",
    fieldErrors: fieldErrorsFrom(error),
  }
}

/** Empty strings from form inputs become NULL in the DB. */
export function nullify(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value
}
