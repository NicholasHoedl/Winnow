/**
 * The month a Budget page shows: the `?month=` param when it is a `YYYY-MM`, else the
 * month `today` is in. Every page of the section reads it the same way, and the hub used
 * to be the only one — the regex lived inline there until T30.
 */
export function monthParam(
  value: string | undefined,
  today: string,
): string {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : today.slice(0, 7)
}
