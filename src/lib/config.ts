// IANA timezone used to compute "due today" / "overdue" for date-only fields.
// Single-user app: one fixed zone, overridable via env.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "America/Chicago"

// Currency for money display (money is stored as integer cents regardless).
export const APP_CURRENCY = process.env.APP_CURRENCY ?? "USD"
