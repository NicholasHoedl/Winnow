"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForSlot, COLOR_SLOTS } from "@/lib/colors"
import {
  createCalendar,
  deleteCalendar,
  updateCalendar,
} from "@/modules/calendar/actions"
import type { Calendar } from "@/modules/calendar/queries"
import { calendarInputSchema } from "@/modules/calendar/validation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type CalendarFormValues = { name: string; color: number }
const EMPTY: CalendarFormValues = { name: "", color: 1 }

export function CalendarManager({
  calendars,
  open,
  onOpenChange,
}: {
  calendars: Calendar[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CalendarFormValues>({
    resolver: standardSchemaResolver(calendarInputSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = editingId
      ? await updateCalendar(editingId, data)
      : await createCalendar(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof CalendarFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(editingId ? "Calendar updated" : "Calendar added")
    setEditingId(null)
    reset(EMPTY)
  })

  function startEdit(cal: Calendar) {
    setEditingId(cal.id)
    reset({ name: cal.name, color: cal.color })
  }

  function cancelEdit() {
    setEditingId(null)
    reset(EMPTY)
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteCalendar(id)
      if (!result.ok) toast.error(result.error)
      else if (editingId === id) cancelEdit()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calendars</DialogTitle>
          <DialogDescription>
            Group events into calendars. Deleting a calendar also deletes its
            events.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cal-name">Name</FieldLabel>
              <Input
                id="cal-name"
                placeholder="e.g. Work"
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel>Colour</FieldLabel>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <div className="flex gap-2">
                    {COLOR_SLOTS.map((slot) => {
                      const on = field.value === slot
                      return (
                        <button
                          key={slot}
                          type="button"
                          aria-label={`Colour ${slot}`}
                          aria-pressed={on}
                          onClick={() => field.onChange(slot)}
                          className={cn(
                            "ring-offset-background size-7 rounded-full ring-2 ring-offset-2 transition-colors",
                            accentForSlot(slot).bar,
                            on ? "ring-foreground/60" : "ring-transparent",
                          )}
                        />
                      )
                    })}
                  </div>
                )}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {editingId ? "Save calendar" : "Add calendar"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>

        <div className="mt-2 max-h-64 overflow-y-auto">
          {calendars.length === 0 ? (
            <p className="text-muted-foreground text-sm">No calendars yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {calendars.map((cal) => (
                <li
                  key={cal.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-full",
                        accentForSlot(cal.color).bar,
                      )}
                    />
                    <span className="truncate font-medium">{cal.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${cal.name}`}
                      onClick={() => startEdit(cal)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${cal.name}`}
                      disabled={pending}
                      onClick={() => remove(cal.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
