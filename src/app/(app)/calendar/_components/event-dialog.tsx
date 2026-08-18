"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createEvent,
  setEventException,
  splitSeriesFrom,
  updateEvent,
} from "@/modules/calendar/actions"
import { addDays, dayDiff } from "@/lib/date"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { type ActionResult } from "@/lib/action-result"
import {
  localDateTime,
  type RecurrenceFreq,
  type RecurrenceMonthlyMode,
} from "@/modules/calendar/service"
import { eventInputSchema } from "@/modules/calendar/validation"
import { cn } from "@/lib/utils"
import { accentForSlot } from "@/lib/colors"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDateLocale } from "@/components/preferences/preferences-provider"

// Which slice of a recurring series an edit/delete targets.
export type EditScope = "this" | "following" | "all"

const SCOPE_OPTIONS: { value: EditScope; label: string }[] = [
  { value: "this", label: "This event" },
  { value: "following", label: "This and following" },
  { value: "all", label: "All events" },
]

type EventFormValues = {
  title: string
  notes?: string
  calendarId: string
  allDay: boolean
  highlighted: boolean
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  recurrenceFreq: RecurrenceFreq
  recurrenceInterval: number
  recurrenceWeekdays: number
  recurrenceMonthlyMode: RecurrenceMonthlyMode
  recurrenceEndDate?: string
}

const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
}

const INTERVAL_UNIT: Record<Exclude<RecurrenceFreq, "none">, string> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  yearly: "years",
}

const WEEKDAY_TOGGLES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const ORDINALS = ["first", "second", "third", "fourth", "fifth"]

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD, or -1 if unparseable. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Labels the two monthly modes off the start date, Google-style. */
function monthlyLabels(date: string): {
  dayOfMonth: string
  nthWeekday: string
} {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d)
    return { dayOfMonth: "the same day", nthWeekday: "the same weekday" }
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const which =
    d + 7 > daysInMonth ? "last" : (ORDINALS[Math.ceil(d / 7) - 1] ?? "last")
  return {
    dayOfMonth: `day ${d}`,
    nthWeekday: `the ${which} ${WEEKDAY_NAMES[dow]}`,
  }
}

/** "Sat, Jul 25" for a single occurrence's date (parsed as UTC to avoid drift). */
function formatOccurrenceDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function emptyValues(defaultDate: string, calendarId = ""): EventFormValues {
  return {
    title: "",
    notes: "",
    calendarId,
    allDay: false,
    highlighted: false,
    startDate: defaultDate,
    startTime: "09:00",
    endDate: "",
    endTime: "",
    recurrenceFreq: "none",
    recurrenceInterval: 1,
    recurrenceWeekdays: 0,
    recurrenceMonthlyMode: "day_of_month",
    recurrenceEndDate: "",
  }
}

export function EventDialog({
  timeZone,
  defaultDate,
  occurrence,
  calendars,
  open,
  onOpenChange,
  onDelete,
}: {
  timeZone: string
  defaultDate: string
  occurrence: EventOccurrence | null
  calendars: Calendar[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (occurrence: EventOccurrence, scope: EditScope) => void
}) {
  const locale = useDateLocale()
  const isEdit = !!occurrence
  const isRecurring =
    !!occurrence && occurrence.seriesEvent.recurrenceFreq !== "none"
  const [scope, setScope] = React.useState<EditScope>("all")
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: standardSchemaResolver(eventInputSchema),
    defaultValues: emptyValues(defaultDate, calendars[0]?.id ?? ""),
  })

  // Default the scope whenever the dialog (re)opens for a new occurrence. Done during
  // render — not in an effect — so the form reset below sees the right scope on the
  // first commit: a recurring occurrence starts on "This event", anything else on "all".
  const openKeyRef = React.useRef<string | null>(null)
  const openKey = open
    ? `${occurrence?.seriesEvent.id ?? "new"}:${occurrence?.date ?? defaultDate}`
    : null
  if (openKey !== openKeyRef.current) {
    openKeyRef.current = openKey
    if (openKey !== null) setScope(isRecurring ? "this" : "all")
  }

  // Reset the form to match what the dialog is showing — but ONLY when what it shows
  // actually changes.
  //
  // The guard is load-bearing. `calendars` and `defaultDate` arrive from a server
  // component, so `revalidatePath("/calendar")` after a save hands this a NEW array
  // identity holding identical contents. Without the guard the effect re-ran on that alone
  // and, on the create path, called `reset(emptyValues(...))` against a dialog the user had
  // already reopened and typed into — silently wiping it. Found as an e2e flake:
  // `calendar-week` filled the form and clicked Add, and the click produced ZERO network
  // requests, because the revalidated tree landed between the last field and the button.
  //
  // Keyed on the occurrence and the scope, because switching "This event" / "All events"
  // must re-fill the fields. Not on either array prop: their identity says nothing about
  // what belongs in the form.
  const resetKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!open) {
      resetKeyRef.current = null
      return
    }
    const resetKey = `${openKey}:${scope}`
    if (resetKeyRef.current === resetKey) return
    resetKeyRef.current = resetKey

    if (!occurrence) {
      reset(emptyValues(defaultDate, calendars[0]?.id ?? ""))
      return
    }
    if (scope === "this") {
      // Just this occurrence: fields from the effective event, dates from wherever the
      // occurrence actually sits — which since T5b is not necessarily the day its
      // series would have produced it on.
      const e = occurrence.event
      reset({
        title: e.title,
        notes: e.notes ?? "",
        calendarId: e.calendarId ?? "",
        allDay: e.allDay,
        // The EFFECTIVE value — `applyExceptions` has already resolved this date's
        // override against the series, so editing one occurrence shows what that date
        // actually does rather than what the series says.
        highlighted: e.highlighted,
        startDate: occurrence.date,
        startTime: e.allDay ? "09:00" : (occurrence.time ?? "09:00"),
        endDate: occurrence.endDate,
        endTime: e.allDay ? "" : (occurrence.endTime ?? ""),
        recurrenceFreq: "none",
        recurrenceInterval: 1,
        recurrenceWeekdays: 0,
        recurrenceMonthlyMode: "day_of_month",
        recurrenceEndDate: "",
      })
      return
    }
    // "following" and "all" both edit a SERIES, so both show the recurrence controls.
    // They differ in where that series starts: "all" from the original anchor, and
    // "following" from this occurrence, which is where the new one will begin.
    const s = occurrence.seriesEvent
    const start = localDateTime(new Date(s.startAt), timeZone)
    const end = s.endAt ? localDateTime(new Date(s.endAt), timeZone) : null
    const splitting = scope === "following"
    reset({
      title: s.title,
      notes: s.notes ?? "",
      calendarId: s.calendarId ?? "",
      allDay: s.allDay,
      highlighted: s.highlighted,
      startDate: splitting ? occurrence.originalDate : start.date,
      startTime: s.allDay ? "09:00" : start.time,
      // The series' end offset, re-anchored on the split date — otherwise a multi-day
      // series would keep the ANCHOR's end date and read as ending in the past.
      endDate: splitting
        ? end
          ? addDays(occurrence.originalDate, dayDiff(start.date, end.date))
          : ""
        : (end?.date ?? ""),
      endTime: end && !s.allDay ? end.time : "",
      recurrenceFreq: s.recurrenceFreq,
      recurrenceInterval: s.recurrenceInterval,
      recurrenceWeekdays: s.recurrenceWeekdays,
      recurrenceMonthlyMode: s.recurrenceMonthlyMode,
      recurrenceEndDate: s.recurrenceEndDate ?? "",
    })
  }, [
    open,
    openKey,
    occurrence,
    scope,
    defaultDate,
    timeZone,
    calendars,
    reset,
  ])

  const onSubmit = handleSubmit(async (data) => {
    let result: ActionResult
    if (!occurrence) {
      result = await createEvent(data)
    } else if (scope === "this") {
      // A single-occurrence override, keyed on the date the SERIES would produce this
      // on rather than where it currently sits. For an occurrence that has already been
      // moved those differ, and using the visible date would write a second override
      // instead of updating the one that exists.
      result = await setEventException(occurrence.seriesEvent.id, {
        originalDate: occurrence.originalDate,
        date: data.startDate,
        endDate: data.endDate,
        title: data.title,
        notes: data.notes,
        calendarId: data.calendarId,
        allDay: data.allDay,
        highlighted: data.highlighted,
        startTime: data.startTime,
        endTime: data.endTime,
      })
    } else if (scope === "following") {
      result = await splitSeriesFrom(
        occurrence.seriesEvent.id,
        occurrence.originalDate,
        data,
      )
    } else {
      result = await updateEvent(occurrence.seriesEvent.id, data)
    }

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof EventFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(
      !occurrence
        ? "Event added"
        : scope === "this"
          ? "This event updated"
          : "Event updated",
    )
    onOpenChange(false)
  })

  const allDay = watch("allDay")
  const freq = watch("recurrenceFreq")
  const startDate = watch("startDate")
  // Only "this and following" pins its date: that date IS the split point, so changing
  // it would move the boundary rather than the event. "This event" is free to move to
  // another day (T5b-S5 lifted the v1 lock), and "All events" moves the whole anchor.
  const lockDate = scope === "following"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {!occurrence
              ? "Add event"
              : scope === "this"
                ? "Edit this event"
                : scope === "following"
                  ? "Edit this and following"
                  : "Edit event"}
          </DialogTitle>
          <DialogDescription>
            {!occurrence
              ? "Add an event to your calendar."
              : scope === "this"
                ? `Editing ${formatOccurrenceDate(occurrence.date, locale)} only — other days are unchanged.`
                : scope === "following"
                  ? `From ${formatOccurrenceDate(occurrence.originalDate, locale)} onwards. Earlier days keep the current settings.`
                  : "Changes apply to the whole series."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {isRecurring && (
              <Field>
                <FieldLabel>Apply changes to</FieldLabel>
                <div className="flex gap-2">
                  {SCOPE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scope === value}
                      onClick={() => setScope(value)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        scope === value
                          ? "border-primary ring-primary/30 ring-2"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="e-title">Title</FieldLabel>
              <Input id="e-title" {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="e-notes">Notes</FieldLabel>
              <Input
                id="e-notes"
                placeholder="Optional"
                {...register("notes")}
              />
              <FieldError errors={[errors.notes]} />
            </Field>

            {calendars.length > 0 && (
              <Field>
                <FieldLabel>Calendar</FieldLabel>
                <Controller
                  control={control}
                  name="calendarId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) =>
                            calendars.find((c) => c.id === value)?.name ??
                            "Select…"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {calendars.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span
                              className={cn(
                                "size-2.5 shrink-0 self-center rounded-full",
                                accentForSlot(c.color).bar,
                              )}
                            />
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}

            {/* Sits beside "All day" as a bare label rather than in a `<Field>`, matching
                it — both are single toggles that need no error slot.

                Under the "This event" scope this writes a per-date override, so a weekly
                standup can be highlighted once without pinning every future one to the
                dashboard. Under "This and following" or "All" it sets the series. */}
            <Controller
              control={control}
              name="highlighted"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  Highlight on the dashboard
                </label>
              )}
            />

            <Controller
              control={control}
              name="allDay"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  All day
                </label>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="e-start-date">Starts</FieldLabel>
                <Input
                  id="e-start-date"
                  type="date"
                  readOnly={lockDate}
                  aria-readonly={lockDate}
                  className={cn(
                    lockDate && "bg-muted cursor-not-allowed opacity-70",
                  )}
                  {...register("startDate")}
                />
                <FieldError errors={[errors.startDate]} />
              </Field>
              {!allDay && (
                <Field>
                  <FieldLabel htmlFor="e-start-time">Start time</FieldLabel>
                  <Input
                    id="e-start-time"
                    type="time"
                    {...register("startTime")}
                  />
                  <FieldError errors={[errors.startTime]} />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="e-end-date">Ends</FieldLabel>
                <Input
                  id="e-end-date"
                  type="date"
                  readOnly={lockDate}
                  aria-readonly={lockDate}
                  className={cn(
                    lockDate && "bg-muted cursor-not-allowed opacity-70",
                  )}
                  {...register("endDate")}
                />
                <FieldError errors={[errors.endDate]} />
              </Field>
              {!allDay && (
                <Field>
                  <FieldLabel htmlFor="e-end-time">End time</FieldLabel>
                  <Input id="e-end-time" type="time" {...register("endTime")} />
                  <FieldError errors={[errors.endTime]} />
                </Field>
              )}
            </div>

            {scope !== "this" && (
              <Field>
                <FieldLabel>Repeat</FieldLabel>
                <Controller
                  control={control}
                  name="recurrenceFreq"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) => FREQ_LABELS[value as RecurrenceFreq]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FREQ_LABELS) as RecurrenceFreq[]).map(
                          (f) => (
                            <SelectItem key={f} value={f}>
                              {FREQ_LABELS[f]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}

            {scope !== "this" && freq !== "none" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="e-interval">
                      Every ({INTERVAL_UNIT[freq]})
                    </FieldLabel>
                    <Input
                      id="e-interval"
                      type="number"
                      min="1"
                      {...register("recurrenceInterval", numberField)}
                    />
                    <FieldError errors={[errors.recurrenceInterval]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="e-until">Until (optional)</FieldLabel>
                    <Input
                      id="e-until"
                      type="date"
                      {...register("recurrenceEndDate")}
                    />
                    <FieldError errors={[errors.recurrenceEndDate]} />
                  </Field>
                </div>

                {freq === "weekly" && (
                  <Field>
                    <FieldLabel>Repeat on</FieldLabel>
                    <Controller
                      control={control}
                      name="recurrenceWeekdays"
                      render={({ field }) => {
                        const startWd = weekdayOf(startDate)
                        const mask =
                          field.value === 0 && startWd >= 0
                            ? 1 << startWd
                            : field.value
                        return (
                          <div className="flex flex-wrap gap-1">
                            {WEEKDAY_TOGGLES.map((label, wd) => {
                              const on = (mask & (1 << wd)) !== 0
                              return (
                                <button
                                  key={wd}
                                  type="button"
                                  aria-pressed={on}
                                  aria-label={WEEKDAY_NAMES[wd]}
                                  onClick={() =>
                                    field.onChange(mask ^ (1 << wd))
                                  }
                                  className={cn(
                                    "size-9 rounded-md text-xs font-medium transition-colors",
                                    on
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        )
                      }}
                    />
                  </Field>
                )}

                {freq === "monthly" && (
                  <Field>
                    <FieldLabel>Repeats on</FieldLabel>
                    <Controller
                      control={control}
                      name="recurrenceMonthlyMode"
                      render={({ field }) => {
                        const labels = monthlyLabels(startDate)
                        const options = [
                          {
                            value: "day_of_month" as const,
                            label: labels.dayOfMonth,
                          },
                          {
                            value: "nth_weekday" as const,
                            label: labels.nthWeekday,
                          },
                        ]
                        return (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            {options.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                aria-pressed={field.value === o.value}
                                onClick={() => field.onChange(o.value)}
                                className={cn(
                                  "flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                                  field.value === o.value
                                    ? "border-primary ring-primary/30 ring-2"
                                    : "border-border hover:bg-accent",
                                )}
                              >
                                On {o.label}
                              </button>
                            ))}
                          </div>
                        )
                      }}
                    />
                  </Field>
                )}
              </>
            )}
          </FieldGroup>

          <DialogFooter className="mt-5 sm:justify-between">
            {occurrence ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  onDelete(occurrence, isRecurring ? scope : "all")
                  onOpenChange(false)
                }}
              >
                <Trash2 className="size-4" />
                {!isRecurring
                  ? "Delete"
                  : scope === "this"
                    ? "Skip this day"
                    : scope === "following"
                      ? "Delete from here"
                      : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : isEdit ? "Save" : "Add"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
