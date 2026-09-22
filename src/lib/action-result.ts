// About this file: what a Server Action hands back to the form or dialog that called it:
// success, or a message and the fields at fault.
//
// What you'll find here:
// - `ActionFailure`: `ok: false` with a message and optional per-field errors.
// - `ActionResult`: `{ ok: true }` or an `ActionFailure`.
// - `fieldErrorsFrom`: the first Zod message for each top-level field.
// - `invalid`: a "Please fix the errors below." failure built from a Zod error.
// - `nullify`: turns an empty form string into `null`.
//
// Related: `src/modules/todos/actions.ts`, one of the Server Action files that use these.

import { type ZodError } from "zod"

// Shared Server Action result shape + the helpers every module's actions file uses.

/**
 * The failure half, named on its own. Several actions return a wider success branch that
 * carries an undo payload (`DeleteFoodResult` and friends), and every one of those unions
 * shares this failure shape — so a helper typed to it can be returned from any of them.
 */
export type ActionFailure = {
  ok: false
  error: string
  fieldErrors?: Record<string, string>
}

export type ActionResult = { ok: true } | ActionFailure

/** First error message per top-level field path — for surfacing Zod issues on fields. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export function invalid(error: ZodError): ActionFailure {
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
