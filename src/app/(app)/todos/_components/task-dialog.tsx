"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createTask, updateTask } from "@/modules/todos/actions"
import type { List, Task } from "@/modules/todos/queries"
import { taskInputSchema, type TaskInput } from "@/modules/todos/validation"
import { usePreferences } from "@/components/preferences/preferences-provider"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const NO_LIST = "none"

export function TaskDialog({
  lists,
  task,
  open,
  onOpenChange,
}: {
  lists: List[]
  task?: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!task
  const { defaultTaskPriority } = usePreferences()
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskInput>({
    resolver: standardSchemaResolver(taskInputSchema),
    defaultValues: {
      title: "",
      notes: "",
      dueDate: "",
      priority: defaultTaskPriority,
      listId: "",
    },
  })

  React.useEffect(() => {
    if (open) {
      reset({
        title: task?.title ?? "",
        notes: task?.notes ?? "",
        dueDate: task?.dueDate ?? "",
        // New tasks default to the user's preferred priority; edits keep theirs.
        priority: task?.priority ?? defaultTaskPriority,
        listId: task?.listId ?? "",
      })
    }
  }, [open, task, reset, defaultTaskPriority])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateTask(task.id, data)
      : await createTask(data)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TaskInput, { message })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(isEdit ? "Task updated" : "Task created")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this task."
              : "Add a task to your list."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                id="task-title"
                autoFocus
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="task-notes">Notes</FieldLabel>
              <Textarea id="task-notes" rows={3} {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="task-due">Due date</FieldLabel>
                <Input
                  id="task-due"
                  type="date"
                  aria-invalid={!!errors.dueDate}
                  {...register("dueDate")}
                />
                <FieldError errors={[errors.dueDate]} />
              </Field>

              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "medium"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full">
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
              </Field>
            </div>

            <Field>
              <FieldLabel>List</FieldLabel>
              <Controller
                control={control}
                name="listId"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_LIST}
                    onValueChange={(value) =>
                      field.onChange(value === NO_LIST ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
