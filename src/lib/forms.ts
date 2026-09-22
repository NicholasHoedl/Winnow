// About this file: client helpers shared by the app's forms, dialogs and capture bars:
// number-input parsing for React Hook Form, and a safe way to call a Server Action.
//
// What you'll find here:
// - `numberField`: `register` options where an empty input means 0.
// - `optionalNumberField`: the same, where empty means unknown and becomes `null`.
// - `requiredNumberField`: the same, where empty stays "" so the schema asks for a value.
// - `restoreIfEmpty`: puts a submitted value back after a failed save, unless the field
//   has been typed in since.
// - `UNREACHABLE_MESSAGE`: the toast text for when the server cannot be reached.
// - `tryWrite`: runs a server write; a network failure becomes that toast and `null`.
//
// Related: `src/lib/action-result.ts`, the result `tryWrite` hands back from an action.

import { toast } from "sonner"

/**
 * React Hook Form `register` options for a numeric input where an empty value
 * means 0 (rather than NaN, which `valueAsNumber` produces and which then trips
 * a "must be a number" validation error on a cleared field).
 */
export const numberField = {
  setValueAs: (value: string) => (value === "" ? 0 : Number(value)),
}

/**
 * The same, for a field where empty means **unknown** rather than zero — so it maps to
 * null and the column stays NULL.
 *
 * The distinction is load-bearing for micronutrients: "0 g fiber" is a measurement,
 * "no fiber figure" is the absence of one, and collapsing the second into the first
 * makes a day's total look precise when most of its entries contributed nothing.
 */
export const optionalNumberField = {
  // Typed `unknown`, not `string`, because RHF calls setValueAs with the CURRENT form
  // value during registration — not only with what the input holds. With a null default
  // (which is the whole point here) a `value.trim()` implementation throws on mount and
  // takes the dialog down. `numberField` above survives the same call only by accident,
  // since Number(null) is 0.
  setValueAs: (value: unknown) => {
    if (value == null) return null
    const text = String(value).trim()
    return text === "" ? null : Number(text)
  },
}

/**
 * The same again, for a field where empty means **nothing typed yet** — so it stays the
 * empty string and the schema is the one that says "Enter an amount".
 *
 * `numberField` above reads an empty box as 0, which is right where 0 is a real answer (a
 * cleared budget is no budget). It is wrong for a transaction's amount: a form that opens
 * on 0 is asking you to select and overtype a figure nobody meant, and one submitted blank
 * would post a zero row rather than say what is missing.
 *
 * Typed `unknown` for the reason `optionalNumberField` gives: RHF calls setValueAs with the
 * CURRENT form value during registration, not only with what the input holds.
 */
export const requiredNumberField = {
  setValueAs: (value: unknown): number | "" => {
    if (value == null) return ""
    const text = String(value).trim()
    return text === "" ? "" : Number(text)
  },
}

/**
 * Put a submitted value back only if the field is still empty.
 *
 * Quick-capture clears itself SYNCHRONOUSLY on submit, before the server action is
 * awaited, for two reasons: a second Enter then has nothing to resubmit, so mashing the
 * key cannot double-post; and the field is free for the next entry immediately, which is
 * the whole point of a capture box.
 *
 * That leaves only the failure path to undo, and its write lands late — after the await —
 * so it must not overwrite whatever has been typed since. Functional rather than a plain
 * value because that is the mechanism: it reads the LATEST state at commit time.
 *
 * (These fields used to disable their submit button while the action was pending. A form
 * whose submit button is disabled does no implicit submission, so Enter was dead for the
 * duration and a second entry typed inside that window vanished with no row, no toast and
 * no error — measured at roughly 300ms, which is well inside a fast typist's reach.)
 */
export function restoreIfEmpty(submitted: string) {
  return (current: string) => (current === "" ? submitted : current)
}

/**
 * What the app says when its own server cannot be reached.
 *
 * The same sentence `use-proposal.ts` already says when a generation cannot reach it,
 * with "created" swapped for "saved" — these are writes. Two facts, because a person
 * with a dropped connection needs both: why nothing happened, and that nothing happened.
 */
export const UNREACHABLE_MESSAGE =
  "Couldn’t reach the app’s own server. Nothing was saved."

/**
 * Run a server write so a dropped connection cannot take the page down with it.
 *
 * `startTransition(async () => { await action() })` has no catch. A Server Action is a
 * `fetch` underneath, and with the network off that fetch REJECTS rather than returning
 * a typed failure — so the rejection escapes the transition, React hands the whole route
 * to its error boundary, and the capture bar or dialog it was typed into is replaced by
 * "Couldn't load your activity…". What was typed goes with it, and the page does not come
 * back when the network does.
 *
 * So the throw is caught here, the app says the one sentence it has for this, and the
 * caller gets `null` — "nothing came back, and the user has already been told". A failure
 * the ACTION returns is passed straight through untouched: that one may belong on a
 * field, and only the caller knows.
 */
export async function tryWrite<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    toast.error(UNREACHABLE_MESSAGE)
    return null
  }
}
