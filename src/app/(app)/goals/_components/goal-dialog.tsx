"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createGoal, updateGoal } from "@/modules/goals/actions"
import type { EventOption } from "@/modules/calendar/queries"
import type { GoalRow } from "@/modules/goals/queries"
import { goalInputSchema } from "@/modules/goals/validation"
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
import { optionalNumberField } from "@/lib/forms"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** A Select item cannot carry an empty value — the same sentinel task-dialog uses. */
const NO_EVENT = "__none__"

type GoalFormValues = {
  title: string
  notes?: string
  targetDate?: string
  // `string | null`, matching `habitInputSchema.goalId` rather than the task dialog's
  // `eventId`. Both shapes exist in this codebase: the task one leaves `""` for the action
  // to `nullify()`, this one normalises in the schema's own transform. What matters is that
  // the form type matches the schema it is resolved against — mixing them is a type error at
  // the resolver, which is where this was caught.
  eventId?: string | null
  // Nullable, not `?: number` — a cleared input has to mean "not tracked", and
  // `optionalNumberField` maps empty to null rather than 0 or NaN.
  targetValue?: number | null
  currentValue?: number | null
  unit?: string
}

export function GoalDialog({
  goal,
  events,
  open,
  onOpenChange,
}: {
  goal: GoalRow | null
  /** Every event, for the target-date link. Already fetched by the (app) layout. */
  events: EventOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!goal
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>({
    resolver: standardSchemaResolver(goalInputSchema),
    defaultValues: {
      title: "",
      notes: "",
      targetDate: "",
      eventId: "",
      targetValue: null,
      currentValue: null,
      unit: "",
    },
  })

  React.useEffect(() => {
    if (!open) return
    if (goal) {
      reset({
        title: goal.title,
        notes: goal.notes ?? "",
        targetDate: goal.targetDate ?? "",
        eventId: goal.eventId ?? "",
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        unit: goal.unit ?? "",
      })
    } else {
      reset({
        title: "",
        notes: "",
        targetDate: "",
        eventId: "",
        targetValue: null,
        currentValue: null,
        unit: "",
      })
    }
  }, [open, goal, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateGoal(goal.id, data)
      : await createGoal(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof GoalFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Goal updated" : "Goal added")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "Add goal"}</DialogTitle>
          <DialogDescription>
            A long-term goal, tracked by the milestones you add to it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="g-title">Title</FieldLabel>
              <Input id="g-title" {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-notes">Notes</FieldLabel>
              <Input
                id="g-notes"
                placeholder="Optional"
                {...register("notes")}
              />
              <FieldError errors={[errors.notes]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-target">Target date (optional)</FieldLabel>
              <Input id="g-target" type="date" {...register("targetDate")} />
              <FieldError errors={[errors.targetDate]} />
            </Field>

            {/* The date, but owned by the calendar.
                "Run a half marathon" has a race day, and that day was being typed twice —
                here and as an event — with nothing keeping the two in step. Linking one
                makes the event the single place it lives: `getGoals` resolves this goal's
                target date from the event, so moving the race moves the goal.
                The typed date above is still stored and still shown while no event is
                chosen, so unlinking returns the goal to it rather than clearing it. */}
            {events.length > 0 && (
              <Field>
                <FieldLabel htmlFor="g-event">
                  Or take the date from an event
                </FieldLabel>
                <Controller
                  control={control}
                  name="eventId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_EVENT}
                      onValueChange={(value) =>
                        field.onChange(value === NO_EVENT ? "" : value)
                      }
                    >
                      <SelectTrigger id="g-event" className="w-full">
                        {/* A function child, not a bare <SelectValue/>: base-ui renders the
                            raw value otherwise, which here would be a uuid. */}
                        <SelectValue>
                          {(value) =>
                            events.find((e) => e.id === value)?.title ??
                            "No event"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_EVENT}>No event</SelectItem>
                        {events.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.eventId]} />
              </Field>
            )}

            {/* Progress for a goal you don't break into milestones. Left blank, the goal
                simply isn't tracked numerically — `optionalNumberField` is what keeps an
                empty input as null rather than 0, which would read as "0 of 0". */}
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="g-current">Current</FieldLabel>
                <Input
                  id="g-current"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="—"
                  {...register("currentValue", optionalNumberField)}
                />
                <FieldError errors={[errors.currentValue]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="g-targetval">Target</FieldLabel>
                <Input
                  id="g-targetval"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="—"
                  {...register("targetValue", optionalNumberField)}
                />
                <FieldError errors={[errors.targetValue]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="g-unit">Unit</FieldLabel>
                <Input id="g-unit" placeholder="books" {...register("unit")} />
                <FieldError errors={[errors.unit]} />
              </Field>
            </div>
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
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
