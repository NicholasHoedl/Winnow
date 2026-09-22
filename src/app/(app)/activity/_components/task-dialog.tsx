"use client"

// About this file: the dialog for creating and editing a task, used on /activity and
// mounted in the app shell so a new task can be started from any page. It also creates
// repeating tasks, and edits either one occurrence or the whole series.
//
// What you'll find here:
// - `NO_LIST`, `DUE_KIND_OPTIONS`, `NO_LINK`, `PRIORITY_LABELS`: the pickers' options,
//   and the "none" values that stand for no list or no link.
// - `eventLabel`: an event's title, date and (unless all-day) time, for the picker.
// - `EditScope`, `TaskFormValues`: "this" or "series", and every field the form holds.
// - `emptyValues`: a new task's starting values.
// - `toTaskInput`, `toRecurrenceInput`: the payloads for a one-off task and for a rule.
// - `TaskDialog`: the exported dialog, which refills the form whenever it opens.
// - `onSubmit`: saves through `createTask`, `updateTask`, `createTaskRecurrence` or
//   `updateTaskRecurrence`, and shows the server's field errors.
// - `previousRepeat`: lets the first repeat choice start the schedule on the due date.
// - The form: This task or Series, title, notes, due date with on or by, priority, list,
//   goal and event links, and `RecurrenceFields`.
//
// Related: `src/modules/todos/actions.ts`, the Server Actions this dialog calls.

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import {
  createTask,
  createTaskRecurrence,
  updateTask,
  updateTaskRecurrence,
} from "@/modules/todos/actions"
import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption } from "@/modules/goals/queries"
import type { ActivityTask, List } from "@/modules/todos/queries"
import { type DueKind, type Priority } from "@/modules/todos/validation"
import { type ActionResult } from "@/lib/action-result"
import { todayInZone } from "@/lib/date"
import { tryWrite } from "@/lib/forms"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { RecurrenceFields } from "@/components/shared/recurrence-fields"
import { Segmented } from "@/components/shared/segmented"
import { useDateLocale } from "@/components/preferences/preferences-provider"

const NO_LIST = "none"

/**
 * Which way a due date binds (T28). "On" is a day: the dashboard shows the task on it and
 * not before. "By" is a deadline: the dashboard shows the task from now until then, and on
 * the day says "due by today".
 */
const DUE_KIND_OPTIONS = [
  { value: "on", label: "Due on" },
  { value: "by", label: "Due by" },
] as const satisfies readonly { value: DueKind; label: string }[]
// Sentinel for the optional goal/event links (a Select item can't carry an empty value).
const NO_LINK = "none"

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[]

// Same-titled series are told apart by when they start — recurring classes often share a
// title AND an anchor date, so the time is what actually distinguishes them.
function eventLabel(
  event: EventOption,
  timeZone: string,
  use24Hour: boolean,
  locale: string,
): string {
  const start = new Date(event.startAt)
  // No year: the popup is only as wide as the trigger and clips overflow, so every
  // character has to earn its place — the time is what tells same-day series apart.
  const date = start.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone,
  })
  if (event.allDay) return `${event.title} · ${date}`
  const time = start.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: !use24Hour,
    timeZone,
  })
  return `${event.title} · ${date}, ${time}`
}

// Which slice of a recurring task an edit targets.
export type EditScope = "this" | "series"

// The superset the dialog binds to: one-off task fields + the recurrence definition.
export type TaskFormValues = {
  title: string
  notes?: string
  dueDate?: string
  dueKind: DueKind
  priority: Priority
  listId?: string
  goalId?: string
  eventId?: string
  repeat: "none" | "daily" | "weekly" | "monthly"
  recurrenceInterval: number
  weekdays: number
  monthlyMode: "day_of_month" | "nth_weekday"
  flexible: boolean
  startDate: string
  endDate?: string
}

function emptyValues(
  today: string,
  priority: Priority,
  listId: string,
): TaskFormValues {
  return {
    title: "",
    notes: "",
    dueDate: today, // new tasks default to today; the field is still clearable
    dueKind: "on",
    priority,
    // The default list, or "" for none — a preference, like the priority above it.
    listId,
    goalId: "",
    eventId: "",
    repeat: "none",
    recurrenceInterval: 1,
    weekdays: 0,
    monthlyMode: "day_of_month",
    flexible: false,
    startDate: today,
    endDate: "",
  }
}

// The one-off task payload (createTask / updateTask validate it server-side).
function toTaskInput(v: TaskFormValues) {
  return {
    title: v.title,
    notes: v.notes,
    dueDate: v.dueDate,
    dueKind: v.dueKind,
    priority: v.priority,
    listId: v.listId,
    goalId: v.goalId,
    eventId: v.eventId,
  }
}

// The rule payload (createTaskRecurrence / updateTaskRecurrence validate it server-side).
function toRecurrenceInput(v: TaskFormValues) {
  return {
    title: v.title,
    notes: v.notes,
    priority: v.priority,
    listId: v.listId,
    freq: v.repeat,
    recurrenceInterval: v.recurrenceInterval,
    weekdays: v.weekdays,
    monthlyMode: v.monthlyMode,
    flexible: v.flexible,
    startDate: v.startDate,
    endDate: v.endDate,
  }
}

export function TaskDialog({
  lists,
  goals,
  events,
  task,
  open,
  onOpenChange,
  initialTitle,
  initialDueDate,
  initialGoalId,
}: {
  lists: List[]
  // Optional cross-module link targets (T2).
  goals: GoalOption[]
  events: EventOption[]
  task?: ActivityTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // Seed values for a NEW task (from quick-capture / the create-intent bus); ignored
  // when editing an existing task.
  initialTitle?: string
  initialDueDate?: string
  /**
   * The goal a new task already belongs to — `/activity?goal=…` knows it, so the dialog
   * fills it in instead of asking. The goal editor pre-links the tasks it creates the
   * same way; this is the same idea one layer up.
   */
  initialGoalId?: string
}) {
  const locale = useDateLocale()
  const isEdit = !!task
  const isRecurring = !!task?.series
  const { defaultTaskPriority, defaultListId, timeZone, use24HourTime } =
    usePreferences()
  // Stable per open session so the reset effect below doesn't loop.
  const today = React.useMemo(
    () => todayInZone(new Date(), timeZone),
    [timeZone],
  )

  const [scope, setScope] = React.useState<EditScope>("this")
  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    defaultValues: emptyValues(today, defaultTaskPriority, defaultListId ?? ""),
  })

  // Default the scope when the dialog (re)opens for a task — during render so the reset
  // effect sees the right scope on the first commit.
  const openKeyRef = React.useRef<string | null>(null)
  const openKey = open ? (task?.id ?? "new") : null
  if (openKey !== openKeyRef.current) {
    openKeyRef.current = openKey
    if (openKey !== null) setScope("this")
  }

  React.useEffect(() => {
    if (!open) return
    if (!task) {
      const base = emptyValues(today, defaultTaskPriority, defaultListId ?? "")
      reset({
        ...base,
        title: initialTitle ?? base.title,
        dueDate: initialDueDate ?? base.dueDate,
        goalId: initialGoalId ?? base.goalId,
      })
      return
    }
    const series = task.series
    if (scope === "series" && series) {
      // Editing the whole series: prefill from the rule.
      reset({
        title: series.title,
        notes: series.notes ?? "",
        dueDate: "",
        dueKind: "on",
        priority: series.priority,
        listId: series.listId ?? "",
        // Links live on concrete task rows, not the rule (the pickers are hidden here).
        goalId: "",
        eventId: "",
        repeat: series.freq,
        recurrenceInterval: series.recurrenceInterval,
        weekdays: series.weekdays,
        monthlyMode: series.monthlyMode,
        flexible: series.flexible,
        startDate: series.startDate,
        endDate: series.endDate ?? "",
      })
      return
    }
    // A one-off task, or "This task" — edit the instance's own fields.
    reset({
      title: task.title,
      notes: task.notes ?? "",
      dueDate: task.dueDate ?? "",
      dueKind: task.dueKind,
      priority: task.priority,
      listId: task.listId ?? "",
      goalId: task.goalId ?? "",
      eventId: task.eventId ?? "",
      repeat: "none",
      recurrenceInterval: 1,
      weekdays: 0,
      monthlyMode: "day_of_month",
      flexible: false,
      startDate: today,
      endDate: "",
    })
  }, [
    open,
    task,
    scope,
    today,
    defaultTaskPriority,
    defaultListId,
    reset,
    initialTitle,
    initialDueDate,
    initialGoalId,
  ])

  const onSubmit = handleSubmit(async () => {
    const v = getValues()
    let result: ActionResult | null
    if (isRecurring && scope === "series") {
      result = await tryWrite(() =>
        updateTaskRecurrence(task!.series!.id, toRecurrenceInput(v)),
      )
    } else if (isEdit) {
      // A one-off task, or "This task" on a recurring instance — both edit the row.
      result = await tryWrite(() => updateTask(task!.id, toTaskInput(v)))
    } else if (v.repeat === "none") {
      result = await tryWrite(() => createTask(toTaskInput(v)))
    } else {
      result = await tryWrite(() => createTaskRecurrence(toRecurrenceInput(v)))
    }

    // Nothing came back: the server is unreachable and `tryWrite` has said so. The dialog
    // stays open holding every value that was typed into it, so the answer to the network
    // coming back is Save again rather than type it all again.
    if (!result) return

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TaskFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(isEdit ? "Task updated" : "Task created")
    onOpenChange(false)
  })

  // Show the recurrence controls when creating, or when editing the series.
  const showRecurrence = !isEdit || (isRecurring && scope === "series")
  const repeat = watch("repeat")

  /**
   * Choosing a repeat starts the schedule on the due date already in the form.
   *
   * The start date was seeded with today, so turning a dated task into a repeating one
   * meant typing the same date twice — and the second one is the one that counts. Only on
   * the FIRST choice, so a start date the user then edits survives a change of frequency,
   * and only when there is a date: a task with no due date still starts today.
   */
  const previousRepeat = React.useRef<TaskFormValues["repeat"]>("none")
  React.useEffect(() => {
    const wasOff = previousRepeat.current === "none"
    previousRepeat.current = repeat
    if (!wasOff || repeat === "none") return
    const dueDate = getValues("dueDate")
    if (dueDate) setValue("startDate", dueDate)
  }, [repeat, getValues, setValue])

  // A concrete due date only applies to a one-off instance, not a repeating schedule.
  const showDue = !showRecurrence || repeat === "none"
  // The kind only means something once there is a date to bind.
  const hasDue = !!watch("dueDate")
  // The link disclosure starts open only when there is a link to see: one the task already
  // carries — an edit must not hide part of what this task IS — or one the page handed
  // down. Read from the props, not from the form, so picking a goal inside it can't make
  // React reassert the attribute over a user who closed it again.
  const linksOpen = task ? !!(task.goalId || task.eventId) : !!initialGoalId

  const title = !task
    ? "New task"
    : scope === "series"
      ? "Edit repeating task"
      : "Edit task"
  const description = !task
    ? "Add a task to your list."
    : scope === "series"
      ? "Changes apply to every occurrence."
      : isRecurring
        ? "Editing just this occurrence."
        : "Update the details of this task."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {isRecurring && (
              <Field>
                <FieldLabel id="task-scope-label">Apply changes to</FieldLabel>
                {/* A row of buttons is a group, and a `FieldLabel` over one names
                    nothing: without this the buttons read out as "This task" with no
                    word about what they applied to (T41). */}
                <div
                  role="group"
                  aria-labelledby="task-scope-label"
                  className="flex gap-2"
                >
                  {(
                    [
                      ["this", "This task"],
                      ["series", "Series"],
                    ] as const
                  ).map(([value, label]) => (
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
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                id="task-title"
                autoFocus
                aria-invalid={!!errors.title}
                {...register("title", {
                  required: "Title is required",
                  maxLength: {
                    value: 200,
                    message: "Keep it under 200 characters",
                  },
                })}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="task-notes">Notes</FieldLabel>
              <Textarea id="task-notes" rows={3} {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              {showDue && (
                <Field>
                  <FieldLabel htmlFor="task-due">Due date</FieldLabel>
                  <Input
                    id="task-due"
                    type="date"
                    aria-invalid={!!errors.dueDate}
                    {...register("dueDate")}
                  />
                  <FieldError errors={[errors.dueDate]} />
                  {/* The group's name must NOT contain "Due date": Playwright's
                      `getByLabel` is a substring match, and `routines.spec.ts` fills the
                      input above with a bare `getByLabel("Due date")` — a group named
                      "Due date kind" made that resolve to two elements. */}
                  {hasDue && (
                    <Controller
                      control={control}
                      name="dueKind"
                      render={({ field }) => (
                        <Segmented
                          value={field.value}
                          onChange={field.onChange}
                          options={DUE_KIND_OPTIONS}
                          label="Due on or by"
                        />
                      )}
                    />
                  )}
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "medium"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="task-priority" className="w-full">
                        {/* Needs a function child — a bare SelectValue renders the
                            raw stored value, so this trigger read "medium". */}
                        <SelectValue>
                          {(value) =>
                            PRIORITY_LABELS[value as Priority] ?? "Medium"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PRIORITY_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="task-list">List</FieldLabel>
              <Controller
                control={control}
                name="listId"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_LIST}
                    onValueChange={(value) =>
                      field.onChange(value === NO_LIST ? "" : value)
                    }
                  >
                    <SelectTrigger id="task-list" className="w-full">
                      {/* Needs a function child — a bare SelectValue renders the raw
                          value (the "none" sentinel) instead of the item's label. */}
                      <SelectValue>
                        {(value) =>
                          lists.find((l) => l.id === value)?.name ?? "No list"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LIST}>No list</SelectItem>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.listId]} />
            </Field>

            {/* Cross-module links (T2). Only for a concrete task — a repeating rule
                has no single row to hang a link on, so these follow `showDue`. */}
            {showDue && (goals.length > 0 || events.length > 0) && (
              // Behind a disclosure since Pass 2: linking is rare, and both pickers were
              // full-width rows on every new task the moment the account held one goal or
              // one event. A native <details> for the reason NutritionExtraFields gives —
              // keyboard-operable and announced correctly with no JS and no new primitive.
              <details
                // Also open for a link the SERVER rejected: an error rendered inside a
                // closed disclosure is an error nobody can see.
                open={linksOpen || !!errors.goalId || !!errors.eventId}
                className="group rounded-lg border px-3 py-2"
              >
                {/* `py-1 -my-1`: a 20px line is the whole of what opens this, under the
                    24px floor. The padding takes it to 28 into the disclosure's own
                    padding, so nothing moves (T40). */}
                <summary className="text-muted-foreground hover:text-foreground -my-1 cursor-pointer py-1 text-sm font-medium select-none">
                  {/* Named for what is behind it: the block renders for goals OR events,
                      and an account with no calendar events was being offered one. */}
                  {goals.length > 0 && events.length > 0
                    ? "Link to a goal or event"
                    : goals.length > 0
                      ? "Link to a goal"
                      : "Link to an event"}
                </summary>
                {/* Full-width rows, not a 2-up grid: a narrow trigger clips its own
                    options (the popup inherits the trigger's width). */}
                <div className="mt-3 flex flex-col gap-5">
                  {goals.length > 0 && (
                    <Field>
                      <FieldLabel htmlFor="task-goal">Goal</FieldLabel>
                      <Controller
                        control={control}
                        name="goalId"
                        render={({ field }) => (
                          <Select
                            value={field.value ? field.value : NO_LINK}
                            onValueChange={(value) =>
                              field.onChange(value === NO_LINK ? "" : value)
                            }
                          >
                            <SelectTrigger id="task-goal" className="w-full">
                              <SelectValue>
                                {(value) =>
                                  goals.find((g) => g.id === value)?.title ??
                                  "No goal"
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_LINK}>No goal</SelectItem>
                              {goals.map((goal) => (
                                <SelectItem key={goal.id} value={goal.id}>
                                  {goal.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError errors={[errors.goalId]} />
                    </Field>
                  )}

                  {events.length > 0 && (
                    <Field>
                      <FieldLabel htmlFor="task-event">Event</FieldLabel>
                      <Controller
                        control={control}
                        name="eventId"
                        render={({ field }) => (
                          <Select
                            value={field.value ? field.value : NO_LINK}
                            onValueChange={(value) =>
                              field.onChange(value === NO_LINK ? "" : value)
                            }
                          >
                            <SelectTrigger id="task-event" className="w-full">
                              <SelectValue>
                                {(value) => {
                                  const match = events.find(
                                    (e) => e.id === value,
                                  )
                                  return match
                                    ? eventLabel(
                                        match,
                                        timeZone,
                                        use24HourTime,
                                        locale,
                                      )
                                    : "No event"
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_LINK}>No event</SelectItem>
                              {events.map((event) => (
                                <SelectItem key={event.id} value={event.id}>
                                  {eventLabel(
                                    event,
                                    timeZone,
                                    use24HourTime,
                                    locale,
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError errors={[errors.eventId]} />
                    </Field>
                  )}
                </div>
              </details>
            )}

            {showRecurrence && (
              <RecurrenceFields
                control={control}
                register={register}
                watch={watch}
                errors={errors}
                idPrefix="tr"
              />
            )}
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
