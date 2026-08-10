"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createRoutine, updateRoutine } from "@/modules/routines/actions"
import type { RoutineRow } from "@/modules/routines/queries"
import { routineInputSchema } from "@/modules/routines/validation"
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

type RoutineFormValues = { name: string; description?: string }

export function RoutineDialog({
  routine,
  open,
  onOpenChange,
}: {
  routine: RoutineRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!routine
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoutineFormValues>({
    resolver: standardSchemaResolver(routineInputSchema),
    defaultValues: { name: "", description: "" },
  })

  React.useEffect(() => {
    if (!open) return
    reset({
      name: routine?.name ?? "",
      description: routine?.description ?? "",
    })
  }, [open, routine, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateRoutine(routine.id, data)
      : await createRoutine(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof RoutineFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Routine saved" : "Routine added")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit routine" : "New routine"}</DialogTitle>
          <DialogDescription>
            A named set of tasks you can spin up in one go.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="r-name">Name</FieldLabel>
              <Input
                id="r-name"
                placeholder="Trip prep"
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="r-description">Description</FieldLabel>
              <Input
                id="r-description"
                placeholder="Optional"
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
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
