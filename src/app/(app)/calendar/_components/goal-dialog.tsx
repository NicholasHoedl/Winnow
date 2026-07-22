"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createGoal, updateGoal } from "@/modules/calendar/actions"
import type { GoalRow } from "@/modules/calendar/queries"
import { goalInputSchema } from "@/modules/calendar/validation"
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

type GoalFormValues = {
  title: string
  notes?: string
  targetDate?: string
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
    defaultValues: { title: "", notes: "", targetDate: "" },
  })

  React.useEffect(() => {
    if (!open) return
    if (goal) {
      reset({
        title: goal.title,
        notes: goal.notes ?? "",
        targetDate: goal.targetDate ?? "",
      })
    } else {
      reset({ title: "", notes: "", targetDate: "" })
    }
  }, [open, goal, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit ? await updateGoal(goal.id, data) : await createGoal(data)
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
              <Input id="g-notes" placeholder="Optional" {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-target">Target date (optional)</FieldLabel>
              <Input id="g-target" type="date" {...register("targetDate")} />
              <FieldError errors={[errors.targetDate]} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
