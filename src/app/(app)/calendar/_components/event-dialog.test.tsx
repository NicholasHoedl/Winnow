import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  createEvent,
  setEventException,
  splitSeriesFrom,
  updateEvent,
} from "@/modules/calendar/actions"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { EventDialog } from "./event-dialog"

vi.mock("@/modules/calendar/actions", () => ({
  createEvent: vi.fn(),
  setEventException: vi.fn(),
  splitSeriesFrom: vi.fn(),
  updateEvent: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

// A real uuid, because `eventInputSchema` validates `calendarId` as one — a readable
// "cal-1" makes the resolver reject the form, `handleSubmit` never reaches the dispatch,
// and every assertion below fails with "expected 1 call, got 0" and no hint as to why.
const CALENDAR_ID = "11111111-1111-4111-8111-111111111111"

const CALENDARS = [
  { id: CALENDAR_ID, name: "Personal", color: 1 },
] as unknown as Calendar[]

/**
 * `startAt`/`endAt` are the load-bearing fields, not a date and a time.
 *
 * The "all" and "following" branches re-derive the local date and time from the TIMESTAMP
 * (`localDateTime(new Date(s.startAt), timeZone)`), so a fixture carrying only
 * `startDate`/`startTime` throws `RangeError: Invalid time value` out of the reset — a
 * render crash rather than a failed assertion, which is a useful thing for it to insist on.
 * 14:00Z is 09:00 in Chicago while daylight time is in force.
 */
const SERIES_EVENT = {
  id: "evt-1",
  title: "Standup",
  notes: null,
  calendarId: CALENDAR_ID,
  allDay: false,
  highlighted: false,
  startAt: "2026-09-10T14:00:00.000Z",
  endAt: "2026-09-10T14:30:00.000Z",
  recurrenceFreq: "weekly",
  recurrenceInterval: 1,
  recurrenceWeekdays: 0,
  recurrenceMonthlyMode: "day_of_month",
  recurrenceEndDate: null,
}

/**
 * `date` is where the block SITS, `originalDate` is where the series would have put it.
 * They are equal until something moves the occurrence, and the whole point of the fixture
 * below is to make them differ.
 */
function occurrence(over: Record<string, unknown> = {}): EventOccurrence {
  return {
    event: SERIES_EVENT,
    seriesEvent: SERIES_EVENT,
    date: "2026-09-10",
    endDate: "2026-09-10",
    time: "09:00",
    endTime: "09:30",
    originalDate: "2026-09-10",
    ...over,
  } as unknown as EventOccurrence
}

function show(props: Partial<React.ComponentProps<typeof EventDialog>> = {}) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <EventDialog
        timeZone="America/Chicago"
        defaultDate="2026-09-10"
        occurrence={null}
        calendars={CALENDARS}
        open
        onOpenChange={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * Which of the four writes a Save performs, and — the reason this file is worth more than
 * the other two — what a per-occurrence override is KEYED on.
 *
 * `Occurrence.originalDate` carries a warning in its own docstring and again at the call
 * site: addressing an override by where the block currently sits writes a SECOND one
 * instead of updating the row that exists, "leaving the series with two overrides fighting
 * over it". Both notes describe a bug already paid for, and nothing was pinning the fix.
 * The moved-occurrence test below is that pin, and it is not reachable from a browser
 * without first dragging an occurrence and then editing it.
 *
 * The Calendar and Repeat controls are base-ui `Select`s and stay in `e2e/` — see the note
 * in `transaction-dialog.test.tsx`.
 */
describe("EventDialog", () => {
  beforeEach(() => {
    vi.mocked(createEvent).mockReset()
    vi.mocked(setEventException).mockReset()
    vi.mocked(splitSeriesFrom).mockReset()
    vi.mocked(updateEvent).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("sends a new event to createEvent", async () => {
    vi.mocked(createEvent).mockResolvedValue({ ok: true })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Dentist" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1))
    expect(setEventException).not.toHaveBeenCalled()
    expect(splitSeriesFrom).not.toHaveBeenCalled()
  })

  // A recurring event opens on the NARROWEST scope — `setScope(isRecurring ? "this" :
  // "all")` — so an unthinking Save touches one date rather than the whole series. The same
  // default `TaskDialog` takes, and worth pinning for the same reason: the failure mode is
  // silent, and it rewrites history someone believed they were leaving alone.
  it("opens a recurring event on This event, so a plain Save overrides one date", async () => {
    vi.mocked(setEventException).mockResolvedValue({ ok: true })
    show({ occurrence: occurrence() })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(setEventException).toHaveBeenCalledTimes(1))
    expect(updateEvent).not.toHaveBeenCalled()
    expect(splitSeriesFrom).not.toHaveBeenCalled()
  })

  it("edits the series itself once the scope says All events", async () => {
    vi.mocked(updateEvent).mockResolvedValue({ ok: true })
    show({ occurrence: occurrence() })

    fireEvent.click(screen.getByRole("button", { name: "All events" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateEvent).mock.calls[0][0]).toBe("evt-1")
    expect(setEventException).not.toHaveBeenCalled()
  })

  // The one this file exists for. See the note above this block.
  it("keys a single-occurrence override on the date the series would produce, not on where the block now sits", async () => {
    vi.mocked(setEventException).mockResolvedValue({ ok: true })
    // Already dragged two days out: the series still says the 10th.
    show({
      occurrence: occurrence({
        date: "2026-09-12",
        endDate: "2026-09-12",
        originalDate: "2026-09-10",
      }),
    })

    fireEvent.click(screen.getByRole("button", { name: "This event" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(setEventException).toHaveBeenCalledTimes(1))
    expect(setEventException).toHaveBeenCalledWith(
      "evt-1",
      // Addressed by the series' date, and moved to where it actually sits. Both halves,
      // because a mutation collapsing them would otherwise still satisfy one of the two.
      expect.objectContaining({
        originalDate: "2026-09-10",
        date: "2026-09-12",
      }),
    )
  })

  it("splits the series from this occurrence for This and following", async () => {
    vi.mocked(splitSeriesFrom).mockResolvedValue({ ok: true })
    show({
      occurrence: occurrence({
        date: "2026-09-12",
        endDate: "2026-09-12",
        originalDate: "2026-09-10",
      }),
    })

    fireEvent.click(screen.getByRole("button", { name: "This and following" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(splitSeriesFrom).toHaveBeenCalledTimes(1))
    const [seriesId, from] = vi.mocked(splitSeriesFrom).mock.calls[0]
    expect(seriesId).toBe("evt-1")
    // The split point is the series' own date too, for the same reason.
    expect(from).toBe("2026-09-10")
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it("puts a server field error on the field that caused it", async () => {
    vi.mocked(createEvent).mockResolvedValue({
      ok: false,
      error: "Could not save that.",
      fieldErrors: { title: "An event needs a title." },
    })
    show()

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "x" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(screen.getByText("An event needs a title.")).toBeInTheDocument(),
    )
    expect(toast.error).toHaveBeenCalledWith("Could not save that.")
  })
})
