import { exportUserData } from "@/modules/account/queries"

// GET /settings/export — download all of the current user's data as JSON.
// Auth is enforced by requireUserId() inside exportUserData (throws if signed out).
export async function GET() {
  let data: Awaited<ReturnType<typeof exportUserData>>
  try {
    data = await exportUserData()
  } catch (error) {
    // A route handler has no error boundary — `error.tsx` only covers pages — so an
    // uncaught throw here is an HTML 500 delivered as a download named
    // `winnow-export.json`, which is a confusing thing to be handed by an Export button.
    // A readable JSON body is worth the four lines.
    //
    // In practice the throw is a database error rather than a missing session: `proxy.ts`
    // gates this path and answers an unauthenticated request with a 307 to /login before
    // the handler runs (verified with curl). `requireUserId()` is still the authority, so
    // the case is handled rather than assumed away.
    const unauthorized =
      error instanceof Error && error.message === "Unauthorized"
    return Response.json(
      {
        error: unauthorized ? "Sign in to export your data." : "Export failed.",
      },
      {
        status: unauthorized ? 401 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="winnow-export.json"',
      "Cache-Control": "no-store",
    },
  })
}
