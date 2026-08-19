"use client"

import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { numberField, optionalNumberField } from "@/lib/forms"
import type { GoalOption } from "@/modules/goals/queries"
import { createHabit, updateHabit } from "@/modules/habits/actions"
import type { HabitRow } from "@/modules/habits/queries"
import { isMeasured, type HabitPeriod } from "@/modules/habits/service"
import { habitInputSchema } from "@/modules/habits/validation"
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

/** A Select item cannot carry an empty value — same sentinel task-dialog uses. */
const NO_GOAL = "none"

const PERIODS: { value: HabitPeriod; label: string }[] = [
  { value: "day", label: "a day" },
  { value: "week", label: "a week" },
  { value: "month", label: "a month" },
]

/**
 * Which of the two quotas this habit keeps.
 *
 * DERIVED from the form's own `unit`, not held in a `useState` beside it. Two reasons, and
 * the second is why the first version of this was wrong:
 *
 * - A separate state has to be initialised from the habit when the dialog opens, which
 *   means setting it inside the same effect that calls `reset` — a synchronous setState in
 *   an effect, which cascades a render and which the lint rules reject outright.
 * - `unit` is the field that can carry the mode without ambiguity. It is `null` for a
 *   session habit and a string for a measured one, and crucially it stays a string —
 *   `""` — while you are still typing. `targetAmount` cannot do this: clearing the number
 *   to retype it would read as null and flip the whole form back to sessions mid-keystroke.
 */
type TrackBy = "sessions" | "amount"

const TRACK_BY: { value: TrackBy; label: string }[] = [
  { value: "sessions", label: "Sessions" },
  { value: "amount", label: "An amount" },
]

type HabitFormValues = {
  title: string
  goalId?: string | null
  period: HabitPeriod
  targetCount: number
  targetAmount?: number | null
  unit?: string | null
}

export function HabitDialog({
  habit,
  goals,
  open,
  onOpenChange,
}: {
  habit: HabitRow | null
  goals: GoalOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!habit
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<HabitFormValues>({
    resolver: standardSchemaResolver(habitInputSchema),
    defaultValues: {
      title: "",
      goalId: null,
      period: "week",
      targetCount: 3,
      targetAmount: null,
      unit: null,
    },
  })

  // The mode, read straight off the field that carries it. See `TrackBy`.
  const unit = useWatch({ control, name: "unit" })
  const trackBy: TrackBy =
    unit === null || unit === undefined ? "sessions" : "amount"

  // What the habit was when the dialog opened, so the warning below can tell an actual
  // switch from simply editing a habit that was always measured.
  const wasMeasured = habit ? isMeasured(habit) : false

  React.useEffect(() => {
    if (!open) return
    reset({
      title: habit?.title ?? "",
      goalId: habit?.goalId ?? null,
      period: habit?.period ?? "week",
      targetCount: habit?.targetCount ?? 3,
      targetAmount: habit?.targetAmount ?? null,
      unit: habit?.unit ?? null,
    })
  }, [open, habit, reset])

  /**
   * Switching modes clears the fields the other one owns.
   *
   * Not cosmetic: `habitInputSchema` refuses an amount without a unit and a unit without
   * an amount, so a leftover value from the mode you just left would fail validation
   * against a field that is no longer on screen — an error with nowhere to point.
   */
  function switchTo(next: TrackBy) {
    if (next === "sessions") {
      setValue("targetAmount", null)
      // Back to null, which is both what the column holds for a session habit and what
      // puts this form in sessions mode. One value, not two things to keep in step.
      setValue("unit", null)
    } else {
      // `""` rather than a placeholder word: it is not a unit, but it is not null either,
      // which is exactly the state "measuring something, not yet said what" needs.
      setValue("unit", "")
      // A measured habit's `targetCount` is unread — `resolveQuota` reads the amount — but
      // the column is NOT NULL, so it is pinned at 1 rather than left at whatever the
      // sessions row was showing.
      setValue("targetCount", 1)
    }
  }

  const onSubmit = handleSubmit(async (data) => {
    // The one rule the schema cannot express, because only the form knows the mode.
    //
    // `habitInputSchema` enforces both-or-neither, and both-empty is a legal session
    // habit — so choosing "An amount" and typing nothing would pass validation and quietly
    // save a habit that counts sessions. This is the layer that can tell those apart.
    if (trackBy === "amount" && data.targetAmount == null) {
      setError("targetAmount", { message: "How much, per period?" })
      return
    }
    const result = isEdit
      ? await updateHabit(habit.id, data)
      : await createHabit(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof HabitFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Habit saved" : "Habit added")
    onOpenChange(false)
  })

  const switching = isEdit && wasMeasured !== (trackBy === "amount")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            How often, not which days — three runs a week on any three days. A
            habit makes no tasks and nothing goes overdue; you log it when you
            do it. For something due on set dates, make a repeating task.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="habit-title">Title</FieldLabel>
              <Input
                id="habit-title"
                placeholder="Attend class"
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="habit-track-by">Track by</FieldLabel>
              <Select
                value={trackBy}
                onValueChange={(value) => value && switchTo(value as TrackBy)}
              >
                <SelectTrigger id="habit-track-by" className="w-full">
                  <SelectValue>
                    {(value) =>
                      TRACK_BY.find((t) => t.value === value)?.label ??
                      "Sessions"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TRACK_BY.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {trackBy === "sessions"
                  ? "Counts the times you did it — three classes a week."
                  : "Counts how much you did — 20 new words a day, 5 km a week."}
              </p>
            </Field>

            {/* Both rows read left to right as the sentence they are: "3 × a week",
                "20 words a week". The period select is shared, because the cadence is the
                same question whichever way the quota is counted. */}
            {trackBy === "sessions" ? (
              <Field>
                <FieldLabel htmlFor="habit-target">How often</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="habit-target"
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    className="w-20"
                    {...register("targetCount", numberField)}
                  />
                  <span className="text-muted-foreground text-sm">×</span>
                  <PeriodSelect control={control} />
                </div>
                <FieldError errors={[errors.targetCount, errors.period]} />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="habit-amount">How much</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="habit-amount"
                    type="number"
                    // `step="any"` and `inputMode="decimal"`, unlike the sessions row: 5.5
                    // km and 0.25 L are real commitments, and the column is `real` for
                    // exactly that reason.
                    step="any"
                    min={0}
                    inputMode="decimal"
                    className="w-20"
                    {...register("targetAmount", optionalNumberField)}
                  />
                  <Input
                    aria-label="Unit"
                    placeholder="words"
                    className="w-24"
                    {...register("unit")}
                  />
                  <PeriodSelect control={control} />
                </div>
                <FieldError
                  errors={[errors.targetAmount, errors.unit, errors.period]}
                />
              </Field>
            )}

            {/* Said before you save, not discovered afterwards.

                `updateHabit` allows this switch on the same reasoning it allows a cadence
                change — it rewrites history, and that is acceptable precisely because it
                is a visible edit. This sentence is what makes it visible. Entries carry an
                amount or they do not, and nothing can invent one after the fact. */}
            {switching && (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                {trackBy === "amount"
                  ? "Everything logged so far recorded a session, not an amount — so it counts as zero against the new target, and the streak is recalculated."
                  : "Everything logged so far recorded an amount. Each one counts as a single session from now on, and the streak is recalculated."}
              </p>
            )}

            {goals.length > 0 && (
              <Field>
                <FieldLabel htmlFor="habit-goal">Goal</FieldLabel>
                <Controller
                  control={control}
                  name="goalId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_GOAL}
                      onValueChange={(value) =>
                        field.onChange(value === NO_GOAL ? null : value)
                      }
                    >
                      <SelectTrigger id="habit-goal" className="w-full">
                        {/* A function child, not a bare <SelectValue/> — without it the
                            trigger renders the raw uuid. */}
                        <SelectValue>
                          {(value) =>
                            goals.find((g) => g.id === value)?.title ??
                            "No goal"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GOAL}>No goal</SelectItem>
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

/**
 * The cadence, shared by both quota rows.
 *
 * Extracted rather than duplicated because the two branches above differ in what they
 * count, not in how often — and a second copy is a second `aria-label` to keep in step
 * with the specs that address it.
 */
function PeriodSelect({
  control,
}: {
  control: import("react-hook-form").Control<HabitFormValues>
}) {
  return (
    <Controller
      control={control}
      name="period"
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          {/* Its own name: the visible label belongs to the count beside it, so without
              this the select is announced as "a week" and nothing else — and no test can
              find it. */}
          <SelectTrigger aria-label="Period" className="flex-1">
            <SelectValue>
              {(value) =>
                PERIODS.find((p) => p.value === value)?.label ?? "a week"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}
