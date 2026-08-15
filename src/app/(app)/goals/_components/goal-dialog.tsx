"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createGoal, updateGoal } from "@/modules/goals/actions"
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

type GoalFormValues = {
  title: string
  notes?: string
  targetDate?: string
  // Nullable, not `?: number` — a cleared input has to mean "not tracked", and
  // `optionalNumberField` maps empty to null rather than 0 or NaN.
  targetValue?: number | null
  currentValue?: number | null
  unit?: string
}

export function GoalDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal: GoalRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!goal
  const {
    register,
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
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        unit: goal.unit ?? "",
      })
    } else {
      reset({
        title: "",
        notes: "",
        targetDate: "",
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
