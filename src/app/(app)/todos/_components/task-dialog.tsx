"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import {
  createTask,
  createTaskRecurrence,
  updateTask,
  updateTaskRecurrence,
} from "@/modules/todos/actions"
import type { List, TaskWithSeries } from "@/modules/todos/queries"
import { type Priority } from "@/modules/todos/validation"
import { type ActionResult } from "@/lib/action-result"
import { todayInZone } from "@/lib/date"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { TaskRecurrenceFields } from "./task-recurrence-fields"

const NO_LIST = "none"

// Which slice of a recurring task an edit targets.
export type EditScope = "this" | "series"

// The superset the dialog binds to: one-off task fields + the recurrence definition.
export type TaskFormValues = {
  title: string
  notes?: string
  dueDate?: string
  priority: Priority
  listId?: string
  repeat: "none" | "daily" | "weekly" | "monthly"
  recurrenceInterval: number
  weekdays: number
  monthlyMode: "day_of_month" | "nth_weekday"
  flexible: boolean
  startDate: string
  endDate?: string
}

function emptyValues(today: string, priority: Priority): TaskFormValues {
  return {
    title: "",
    notes: "",
    dueDate: today, // new tasks default to today; the field is still clearable
    priority,
    listId: "",
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
    priority: v.priority,
    listId: v.listId,
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
  task,
  open,
  onOpenChange,
}: {
  lists: List[]
  task?: TaskWithSeries | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!task
  const isRecurring = !!task?.series
  const { defaultTaskPriority, timeZone } = usePreferences()
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
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    defaultValues: emptyValues(today, defaultTaskPriority),
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
      reset(emptyValues(today, defaultTaskPriority))
      return
    }
    const series = task.series
    if (scope === "series" && series) {
      // Editing the whole series: prefill from the rule.
      reset({
        title: series.title,
        notes: series.notes ?? "",
        dueDate: "",
        priority: series.priority,
        listId: series.listId ?? "",
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
      priority: task.priority,
      listId: task.listId ?? "",
      repeat: "none",
      recurrenceInterval: 1,
      weekdays: 0,
      monthlyMode: "day_of_month",
      flexible: false,
      startDate: today,
      endDate: "",
    })
  }, [open, task, scope, today, defaultTaskPriority, reset])

  const onSubmit = handleSubmit(async () => {
    const v = getValues()
    let result: ActionResult
    if (isRecurring && scope === "series") {
      result = await updateTaskRecurrence(task!.series!.id, toRecurrenceInput(v))
    } else if (isEdit) {
      // A one-off task, or "This task" on a recurring instance — both edit the row.
      result = await updateTask(task!.id, toTaskInput(v))
    } else if (v.repeat === "none") {
      result = await createTask(toTaskInput(v))
    } else {
      result = await createTaskRecurrence(toRecurrenceInput(v))
    }

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
  // A concrete due date only applies to a one-off instance, not a repeating schedule.
  const showDue = !showRecurrence || repeat === "none"

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
                <FieldLabel>Apply changes to</FieldLabel>
                <div className="flex gap-2">
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
                </Field>
              )}

              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "medium"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>List</FieldLabel>
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
                    <SelectTrigger className="w-full">
                      <SelectValue />
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

            {showRecurrence && (
              <TaskRecurrenceFields
                control={control}
                register={register}
                watch={watch}
                errors={errors}
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
