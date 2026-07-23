import { z } from "zod"

import { CURRENCY_CODES } from "@/lib/preferences"

// Robust across runtimes: constructing a formatter throws RangeError for an
// unknown IANA zone (no dependence on Intl.supportedValuesOf).
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const userPreferencesSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  use24HourTime: z.boolean(),
  defaultTaskPriority: z.enum(["low", "medium", "high"]),
})
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>
