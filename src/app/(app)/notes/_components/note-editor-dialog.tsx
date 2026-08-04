"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createNote, updateNote } from "@/modules/notes/actions"
import type { NoteRow } from "@/modules/notes/queries"
import { noteInputSchema } from "@/modules/notes/validation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

import { formatEntryDate } from "./format"

type NoteFormValues = {
  title?: string
  body?: string
  entryDate?: string
  pinned?: boolean
}

/**
 * One dialog for both kinds of note. `entryDate` is the only thing that differs, and it
 * is never editable here: a journal entry is opened for a specific day (from the header
 * button or the dashboard card), and letting the date be retyped would turn the
 * one-per-day constraint into a form error for no gain.
 */
export function NoteEditorDialog({
  note,
  entryDate,
  open,
  onOpenChange,
}: {
  note: NoteRow | null
  /** Set when creating a journal entry for a given day; null for a free-form note. */
  entryDate: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!note
  const journalDate = note?.entryDate ?? entryDate

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NoteFormValues>({
    resolver: standardSchemaResolver(noteInputSchema),
    defaultValues: { title: "", body: "", entryDate: "", pinned: false },
  })

  // `useWatch` rather than `watch()`: same value, but it is a real hook, so it doesn't
  // add a sixth `react-hooks/incompatible-library` warning to the four the older dialogs
  // already carry.
  const pinned = useWatch({ control, name: "pinned" })

  React.useEffect(() => {
    if (!open) return
    reset({
      title: note?.title ?? "",
      body: note?.body ?? "",
      entryDate: journalDate ?? "",
      pinned: note?.pinned ?? false,
    })
  }, [open, note, journalDate, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateNote(note.id, data)
      : await createNote(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof NoteFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Note saved" : "Note added")
    onOpenChange(false)
  })

  const heading = journalDate
    ? `Journal — ${formatEntryDate(journalDate)}`
    : isEdit
      ? "Edit note"
      : "New note"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {journalDate
              ? "One entry per day. Write as much or as little as you like."
              : "A free-form note. The title is optional — the first line stands in for it."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="n-title">Title</FieldLabel>
              <Input
                id="n-title"
                placeholder="Optional"
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="n-body">Body</FieldLabel>
              <Textarea id="n-body" rows={10} {...register("body")} />
              <FieldError errors={[errors.body]} />
            </Field>
            {/* The date is fixed for a journal entry and absent for a note, so it rides
                along as a hidden value rather than a field. */}
            <input type="hidden" {...register("entryDate")} />

            {/* Pinning is a free-form-note affordance: journal entries are already
                ordered by their date, so pinning one would put it in two places. */}
            {!journalDate && (
              <Field>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!pinned}
                    onCheckedChange={(checked) =>
                      setValue("pinned", checked === true)
                    }
                  />
                  Pin to the top
                </label>
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
