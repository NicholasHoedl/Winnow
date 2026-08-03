import { buildCalendarIcs, resolveFeedToken } from "@/modules/calendar/queries"

// GET /api/calendar/<token> — the subscribe feed.
//
// The only route in the app that answers without a session. It lives under /api because
// proxy.ts's matcher already excludes that prefix, so nothing about the auth regex has to
// be widened to let it through — its own comment warns that the extension class there
// matches any ROUTE ending in those characters, and `.ics` would have opened far more than
// this one endpoint.
//
// A calendar app polling a feed has nowhere to put a cookie, so the URL itself is the
// credential (ADR-0008). Consequences that are load-bearing rather than incidental:
//
//   • Every miss answers 404 — unknown token, malformed token, empty token, all identical.
//     A 401 or a different body for "that token used to exist" would confirm which tokens
//     are real to anyone probing.
//   • The token resolves the user. Nothing here reads a session, and no query it calls
//     may fall back to one.
//   • No cookie is ever set, so subscribing cannot hand a caller a session by accident.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const userId = await resolveFeedToken(token)
  if (!userId) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  let body: string
  try {
    body = await buildCalendarIcs(userId)
  } catch {
    // Deliberately bare: a subscriber cannot act on a reason, and the token is valid, so
    // there is nothing here worth distinguishing from any other server-side failure.
    return new Response("Feed unavailable", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Named so a subscriber that offers to save the file suggests something sensible;
      // inline rather than attachment, because this is subscribed to, not downloaded.
      "Content-Disposition": 'inline; filename="winnow.ics"',
      // The subscriber decides when to poll; never let anything in between decide for it.
      "Cache-Control": "no-store",
    },
  })
}
