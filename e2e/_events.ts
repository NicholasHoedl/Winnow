import { withTestDb } from "./_test-db"

/**
 * Remove test events straight from the database, rather than by driving the calendar.
 *
 * **Cleanup is not coverage.** `calendar-following.spec.ts` used to sweep its strays through
 * the UI: four day-view navigations, and per day up to eight rounds of open-the-event,
 * switch-scope-to-All, Delete, re-count. That is up to thirty-two server round trips against
 * a dev server inside the same 60s budget the test itself had already spent most of — and it
 * was the first thing in the suite to fail whenever the machine was busy, timing out in
 * `afterEach` with the test body long since green. Worse, it timed out hardest exactly when a
 * test had failed and left extra strays behind, so one real failure reliably became two, the
 * second pointing at cleanup rather than at the bug.
 *
 * Nothing is lost by going around the UI, because deleting an event IS one of the things
 * these specs test — `deleting from here truncates the series, and undo puts it back` drives
 * the real dialog and asserts on the result. Repeating that in the teardown proved nothing
 * the test had not already proved, at a cost that broke the run.
 *
 * The foreign keys make this equivalent to what the app itself does: `event_exceptions`
 * cascades from `events`, and a task linked to a deleted event has its `event_id` set to
 * null rather than being deleted with it.
 */
export async function deleteEventsMatching(prefix: string): Promise<number> {
  return withTestDb(async (client) => {
    // Prefix-anchored and parameterised. Every spec here titles its fixtures
    // `${PREFIX} something ${Date.now()}`, so anchoring cannot reach a title that merely
    // mentions the prefix somewhere in the middle.
    const { rowCount } = await client.query(
      "delete from events where title like $1",
      [`${prefix}%`],
    )
    return rowCount ?? 0
  })
}
