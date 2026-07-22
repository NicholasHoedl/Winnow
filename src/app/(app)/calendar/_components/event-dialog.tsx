"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createEvent, updateEvent } from "@/modules/calendar/actions"
import type { EventRow } from "@/modules/calendar/queries"
import { localDateTime, type RecurrenceFreq } from "@/modules/calendar/service"
import { eventInputSchema } from "@/modules/calendar/validation"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type EventFormValues = {
  title: string
  notes?: string
  allDay: boolean
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  recurrenceFreq: RecurrenceFreq
  recurrenceInterval: number
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

function emptyValues(defaultDate: string): EventFormValues {
  return {
    title: "",
    notes: "",
    allDay: false,
    startDate: defaultDate,
    startTime: "09:00",
    endDate: "",
    endTime: "",
    recurrenceFreq: "none",
    recurrenceInterval: 1,
    recurrenceEndDate: "",
  }
}

export function EventDialog({
  timeZone,
  defaultDate,
  event,
  open,
  onOpenChange,
  onDelete,
}: {
  timeZone: string
  defaultDate: string
  event: EventRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (event: EventRow) => void
}) {
  const isEdit = !!event
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
    defaultValues: emptyValues(defaultDate),
  })

  React.useEffect(() => {
    if (!open) return
    if (event) {
      const start = localDateTime(new Date(event.startAt), timeZone)
      const end = event.endAt ? localDateTime(new Date(event.endAt), timeZone) : null
      reset({
        title: event.title,
        notes: event.notes ?? "",
        allDay: event.allDay,
        startDate: start.date,
        startTime: event.allDay ? "09:00" : start.time,
        endDate: end?.date ?? "",
        endTime: end && !event.allDay ? end.time : "",
        recurrenceFreq: event.recurrenceFreq,
        recurrenceInterval: event.recurrenceInterval,
        recurrenceEndDate: event.recurrenceEndDate ?? "",
      })
    } else {
      reset(emptyValues(defaultDate))
    }
  }, [open, event, defaultDate, timeZone, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateEvent(event.id, data)
      : await createEvent(data)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof EventFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Event updated" : "Event added")
    onOpenChange(false)
  })

  const allDay = watch("allDay")
  const freq = watch("recurrenceFreq")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this event. Changes apply to the whole series."
              : "Add an event to your calendar."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="e-title">Title</FieldLabel>
              <Input id="e-title" {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="e-notes">Notes</FieldLabel>
              <Input id="e-notes" placeholder="Optional" {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>

            <Controller
              control={control}
              name="allDay"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  All day
                </label>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="e-start-date">Starts</FieldLabel>
                <Input id="e-start-date" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>
              {!allDay && (
                <Field>
                  <FieldLabel htmlFor="e-start-time">Start time</FieldLabel>
                  <Input id="e-start-time" type="time" {...register("startTime")} />
                  <FieldError errors={[errors.startTime]} />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="e-end-date">Ends</FieldLabel>
                <Input id="e-end-date" type="date" {...register("endDate")} />
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
                      {(Object.keys(FREQ_LABELS) as RecurrenceFreq[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQ_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {freq !== "none" && (
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
                  <Input id="e-until" type="date" {...register("recurrenceEndDate")} />
                  <FieldError errors={[errors.recurrenceEndDate]} />
                </Field>
              </div>
            )}
          </FieldGroup>

          <DialogFooter className="mt-5 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  onDelete(event)
                  onOpenChange(false)
                }}
              >
                <Trash2 className="size-4" />
                Delete
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
