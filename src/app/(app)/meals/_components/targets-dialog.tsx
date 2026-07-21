"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { setMacroTargets } from "@/modules/meals/actions"
import type { MacroTargets } from "@/modules/meals/queries"
import { macroTargetsSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
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

type TargetsFormValues = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

export function TargetsDialog({
  targets,
  open,
  onOpenChange,
}: {
  targets: MacroTargets | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TargetsFormValues>({
    resolver: standardSchemaResolver(macroTargetsSchema),
    defaultValues: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  })

  React.useEffect(() => {
    if (open) {
      reset({
        calories: targets?.calories ?? 0,
        proteinG: targets?.proteinG ?? 0,
        carbsG: targets?.carbsG ?? 0,
        fatG: targets?.fatG ?? 0,
      })
    }
  }, [open, targets, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = await setMacroTargets(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TargetsFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Targets saved")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily targets</DialogTitle>
          <DialogDescription>
            Set your daily macro goals. Leave a value at 0 to not track it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="t-cal">Calories</FieldLabel>
                <Input
                  id="t-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-pro">Protein (g)</FieldLabel>
                <Input
                  id="t-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-carb">Carbs (g)</FieldLabel>
                <Input
                  id="t-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-fat">Fat (g)</FieldLabel>
                <Input
                  id="t-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
