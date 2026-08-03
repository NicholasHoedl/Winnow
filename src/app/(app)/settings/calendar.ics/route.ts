import { requireUserId } from "@/lib/session"
import { buildCalendarIcs } from "@/modules/calendar/queries"

// GET /settings/calendar.ics — download the calendar as an iCalendar file.
//
// The signed-in twin of the token feed at /api/calendar/[token]. Both serve the identical
// body; this one exists because a one-off download is worth having on its own, and because
// it proves the serializer end-to-end with the session doing the authenticating — one new
// thing at a time.
//
// Note `.ics` is NOT in proxy.ts's extension exemption list (that list stops at `.ico`), so
// this path stays gated like any other page. That is deliberate: this route has no token to
// authenticate with.
export async function GET() {
  let body: string
  try {
    body = await buildCalendarIcs(await requireUserId())
  } catch (error) {
    // Same reasoning as settings/export/route.ts: a route handler has no error boundary,
    // so an uncaught throw is an HTML 500 delivered as a file called
    // `winnow-calendar.ics`, which is a baffling thing to hand someone.
    const unauthorized =
      error instanceof Error && error.message === "Unauthorized"
    return new Response(
      unauthorized ? "Sign in to download your calendar." : "Export failed.",
      {
        status: unauthorized ? 401 : 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    )
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="winnow-calendar.ics"',
      "Cache-Control": "no-store",
    },
  })
}
