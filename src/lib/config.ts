// IANA timezone used to compute "due today" / "overdue" for date-only fields.
// Single-user app: one fixed zone, overridable via env.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "America/Chicago"
