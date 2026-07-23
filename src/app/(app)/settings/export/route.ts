import { exportUserData } from "@/modules/account/queries"

// GET /settings/export — download all of the current user's data as JSON.
// Auth is enforced by requireUserId() inside exportUserData (throws if signed out).
export async function GET() {
  const data = await exportUserData()
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="winnow-export.json"',
      "Cache-Control": "no-store",
    },
  })
}
