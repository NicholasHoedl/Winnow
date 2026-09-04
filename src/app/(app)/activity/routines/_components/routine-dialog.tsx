"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Unfinished = "keep" | "drop"

const UNFINISHED_OPTIONS: { value: Unfinished; label: string }[] = [
  { value: "keep", label: "Leave them overdue" },
  { value: "drop", label: "Delete them" },
]

type RoutineFormValues = {
  name: string
  description?: string
  onUnfinished?: Unfinished
}

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
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoutineFormValues>({
    resolver: standardSchemaResolver(routineInputSchema),
    defaultValues: { name: "", description: "", onUnfinished: "keep" },
  })

  React.useEffect(() => {
    if (!open) return
    reset({
      name: routine?.name ?? "",
      description: routine?.description ?? "",
      onUnfinished: routine?.onUnfinished ?? "keep",
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
            A named set of tasks you can spin up in one go. Nothing here repeats
            on its own — you run it when the occasion comes round, and it makes
            the tasks then.
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
              <Textarea
                id="r-description"
                rows={2}
                placeholder="Optional"
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="r-unfinished">
                When a task isn&apos;t done by its due date
              </FieldLabel>
              <Controller
                control={control}
                name="onUnfinished"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "keep"}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="r-unfinished">
                      {/* A bare <SelectValue/> renders the raw value — "keep" — rather
                          than the label. base-ui needs the function child. */}
                      <SelectValue>
                        {(value) =>
                          UNFINISHED_OPTIONS.find((o) => o.value === value)
                            ?.label ?? "Leave them overdue"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {UNFINISHED_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {/* Says "deleted", not "removed" or "cleared". This throws work away with no
                  undo, and the form is the only place that can warn before it happens. */}
              <p className="text-muted-foreground text-xs">
                Deleting applies once the day has passed, and only to tasks you
                never finished — completed ones are kept. There is no undo.
              </p>
              <FieldError errors={[errors.onUnfinished]} />
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
