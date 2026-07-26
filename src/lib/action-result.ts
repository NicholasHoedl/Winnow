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
