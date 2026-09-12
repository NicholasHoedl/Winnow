import { seedUserId, withTestDb } from "./_test-db"

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

/**
 * Create a calendar straight in the database, and hand back its id.
 *
 * The manager can make one through its form, and `manager-renames.spec.ts` proves that;
 * a spec about DELETING one wants the calendar to exist without spending a journey on it.
 */
export async function seedCalendar(name: string): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into calendars (user_id, name, color, sort_order)
       values ($1, $2, 4, 99) returning id`,
      [userId, name],
    )
    return rows[0].id
  })
}

/** One timed event on a given calendar, on a given date at noon UTC. */
export async function seedEvent(fields: {
  title: string
  calendarId: string
  date: string
}): Promise<string> {
  return withTestDb(async (client) => {
    const userId = await seedUserId(client)
    const { rows } = await client.query<{ id: string }>(
      `insert into events (user_id, calendar_id, title, start_at, end_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        userId,
        fields.calendarId,
        fields.title,
        `${fields.date}T12:00:00Z`,
        `${fields.date}T13:00:00Z`,
      ],
    )
    return rows[0].id
  })
}

/** Remove test calendars. Their events cascade, exactly as deleting one in the app does. */
export async function deleteCalendarsMatching(
  fragment: string,
): Promise<number> {
  return withTestDb(async (client) => {
    const { rowCount } = await client.query(
      "delete from calendars where strpos(name, $1) > 0",
      [fragment],
    )
    return rowCount ?? 0
  })
}
