"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { numberField } from "@/lib/forms"
import type { GoalOption } from "@/modules/goals/queries"
import { createHabit, updateHabit } from "@/modules/habits/actions"
import type { HabitRow } from "@/modules/habits/queries"
import type { HabitPeriod } from "@/modules/habits/service"
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

type HabitFormValues = {
  title: string
  goalId?: string | null
  period: HabitPeriod
  targetCount: number
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
    setError,
    formState: { errors, isSubmitting },
  } = useForm<HabitFormValues>({
    resolver: standardSchemaResolver(habitInputSchema),
    defaultValues: { title: "", goalId: null, period: "week", targetCount: 3 },
  })

  React.useEffect(() => {
    if (!open) return
    reset({
      title: habit?.title ?? "",
      goalId: habit?.goalId ?? null,
      period: habit?.period ?? "week",
      targetCount: habit?.targetCount ?? 3,
    })
  }, [open, habit, reset])

  const onSubmit = handleSubmit(async (data) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            How often, not which days. A habit makes no tasks and nothing goes
            overdue — you log it when you do it.
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

            {/* Reads left to right as the sentence it is: "3 × a week". */}
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
                <Controller
                  control={control}
                  name="period"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      {/* Its own name: the visible label belongs to the count beside it,
                          so without this the select is announced as "a week" and nothing
                          else — and no test can find it. */}
                      <SelectTrigger aria-label="Period" className="flex-1">
                        <SelectValue>
                          {(value) =>
                            PERIODS.find((p) => p.value === value)?.label ??
                            "a week"
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
              </div>
              <FieldError errors={[errors.targetCount, errors.period]} />
            </Field>

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
