"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { optionalNumberField } from "@/lib/forms"
import { addRoutineItem, updateRoutineItem } from "@/modules/routines/actions"
import type { RoutineItemRow } from "@/modules/routines/queries"
import { routineItemInputSchema } from "@/modules/routines/validation"
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
import { Textarea } from "@/components/ui/textarea"

// A Select item can't carry an empty value, so "no list" needs a sentinel.
const NO_LIST = "none"

export type ListOption = { id: string; name: string }

type ItemFormValues = {
  title: string
  notes?: string
  // Nullable, not `?: number` — a cleared input has to mean "no due date", and
  // `optionalNumberField` maps empty to null rather than 0, which would mean "same day".
  dueOffsetDays?: number | null
  priority?: "low" | "medium" | "high"
  listId?: string | null
}

export function RoutineItemDialog({
  routineId,
  item,
  lists,
  open,
  onOpenChange,
}: {
  routineId: string
  item: RoutineItemRow | null
  lists: ListOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!item
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: standardSchemaResolver(routineItemInputSchema),
    defaultValues: {
      title: "",
      notes: "",
      dueOffsetDays: 0,
      priority: "medium",
      listId: null,
    },
  })

  React.useEffect(() => {
    if (!open) return
    reset({
      title: item?.title ?? "",
      notes: item?.notes ?? "",
      // New items default to the day of the run; that is the common case, and a lead
      // time is the deliberate edit.
      dueOffsetDays: item ? item.dueOffsetDays : 0,
      priority: item?.priority ?? "medium",
      listId: item?.listId ?? null,
    })
  }, [open, item, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateRoutineItem(item.id, data)
      : await addRoutineItem(routineId, data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof ItemFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Task saved" : "Task added")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add task"}</DialogTitle>
          <DialogDescription>
            One task in the routine. The offset is counted from the day you run
            it — negative for something that has to happen beforehand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ri-title">Title</FieldLabel>
              <Input
                id="ri-title"
                placeholder="Book the kennel"
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ri-notes">Notes</FieldLabel>
              <Textarea id="ri-notes" rows={2} {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ri-offset">Days from run</FieldLabel>
                <Input
                  id="ri-offset"
                  type="number"
                  step="1"
                  inputMode="numeric"
                  placeholder="—"
                  {...register("dueOffsetDays", optionalNumberField)}
                />
                <FieldError errors={[errors.dueOffsetDays]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ri-priority">Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "medium"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="ri-priority" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.priority]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="ri-list">List</FieldLabel>
              <Controller
                control={control}
                name="listId"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_LIST}
                    onValueChange={(value) =>
                      field.onChange(value === NO_LIST ? null : value)
                    }
                  >
                    <SelectTrigger id="ri-list" className="w-full">
                      {/* Needs a function child — a bare SelectValue renders the raw
                          value (the "none" sentinel) instead of the item's label. */}
                      <SelectValue>
                        {(value) =>
                          lists.find((l) => l.id === value)?.name ?? "No list"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LIST}>No list</SelectItem>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.listId]} />
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
