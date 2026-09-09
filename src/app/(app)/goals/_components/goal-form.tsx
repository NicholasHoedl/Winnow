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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { optionalNumberField } from "@/lib/forms"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

function valuesFor(goal: GoalRow | null): GoalFormValues {
  return goal
    ? {
        title: goal.title,
        notes: goal.notes ?? "",
        targetDate: goal.targetDate ?? "",
        eventId: goal.eventId ?? "",
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        unit: goal.unit ?? "",
      }
    : {
        title: "",
        notes: "",
        targetDate: "",
        eventId: "",
        targetValue: null,
        currentValue: null,
        unit: "",
      }
}

/**
 * The goal's own fields — title, notes, dates, the number it is measured by — as one form.
 *
 * Shared by the two places they are edited: the create dialog, and the Details section of
 * the goal editor. It used to be the body of an edit dialog reached from the detail view's
 * "Edit goal" button; T27 folded that hop into the editor (ADR-0021), and the form moved
 * here so the create path and the edit path cannot drift.
 *
 * A form with one submit rather than write-on-blur like the rows around it in the editor:
 * these fields validate as a SET — a target needs its unit, a date its shape — and a
 * partial save of a number target is exactly what per-field writes would produce.
 */
export function GoalForm({
  goal,
  events,
  open,
  submitLabel,
  onSaved,
  onCancel,
}: {
  goal: GoalRow | null
  /** Every event, for the target-date link. Already fetched by the (app) layout. */
  events: EventOption[]
  /** The fields reset from `goal` each time this turns true — the dialog or section opening. */
  open: boolean
  submitLabel: string
  onSaved: () => void
  /** Renders a Cancel button beside the submit when given. */
  onCancel?: () => void
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>({
    resolver: standardSchemaResolver(goalInputSchema),
    defaultValues: valuesFor(goal),
  })

  // Reset on OPENING, not on every render of `goal`. The editor's goal is re-read after
  // each write it makes — ticking a milestone hands this form a fresh object — and a reset
  // on that would wipe a title mid-typing. The key is the goal being edited; closing
  // clears it, so reopening on the same goal resets again.
  const resetKey = open ? (goal?.id ?? "new") : null
  const lastKey = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (resetKey === null) {
      lastKey.current = null
      return
    }
    if (resetKey === lastKey.current) return
    lastKey.current = resetKey
    reset(valuesFor(goal))
  }, [resetKey, goal, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = goal
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
    toast.success(goal ? "Goal updated" : "Goal added")
    onSaved()
  })

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="g-title">Title</FieldLabel>
          <Input id="g-title" {...register("title")} />
          <FieldError errors={[errors.title]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="g-notes">Notes</FieldLabel>
          <Textarea
            id="g-notes"
            rows={3}
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
                        events.find((e) => e.id === value)?.title ?? "No event"
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
      <div className="mt-5 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
