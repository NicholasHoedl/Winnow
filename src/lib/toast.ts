import { toast } from "sonner"

/**
 * How long a toast carrying an Undo stays up.
 *
 * Every one of them ran on sonner's default until T42 — 4 seconds, measured at 4.4, the
 * shortest window in the app and a number nobody chose. An undo is not a notification:
 * it has to survive noticing the toast, reading what happened, deciding, and reaching
 * the button, and on a phone the reach is a thumb crossing the screen. Eight seconds is
 * the cheapest honest answer, and one constant is easier to change again than eighteen
 * call sites are.
 */
export const UNDO_TOAST_MS = 8000

/**
 * The app's undo toast: what just happened, and the one button that takes it back.
 *
 * Every delete, skip and bulk create in Winnow offers Undo, and each one used to spell
 * out the same `action: { label: "Undo", onClick }` object. Spelling it out is how they
 * ended up agreeing on the label and disagreeing on nothing else — there was no duration
 * to disagree about, because none of them set one.
 *
 * `variant` for the two toasts that are not plain news: "success" when the message
 * reports a creation rather than a removal ("Added 3 tasks"), and "error" for the one
 * case where a write failed PART WAY and the rows it did manage are still worth taking
 * back — a red toast that also carries the button.
 */
export function undoToast(
  message: string,
  onUndo: () => void,
  options: { description?: string; variant?: "success" | "error" } = {},
): void {
  const settings = {
    description: options.description,
    duration: UNDO_TOAST_MS,
    action: { label: "Undo", onClick: onUndo },
  }
  if (options.variant === "success") toast.success(message, settings)
  else if (options.variant === "error") toast.error(message, settings)
  else toast(message, settings)
}
