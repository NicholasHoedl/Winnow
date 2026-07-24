"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createCategory, deleteCategory } from "@/modules/budget/actions"
import type { Category } from "@/modules/budget/queries"
import { categoryInputSchema } from "@/modules/budget/validation"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CategoryFormValues = {
  name: string
  kind: "income" | "expense"
}

const EMPTY: CategoryFormValues = { name: "", kind: "expense" }

export function CategoryManager({
  categories,
  open,
  onOpenChange,
}: {
  categories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [confirmTarget, setConfirmTarget] = React.useState<Category | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: standardSchemaResolver(categoryInputSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await createCategory(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof CategoryFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Category added")
    reset(EMPTY)
  })

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteCategory(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  const groups = [
    { label: "Expense", items: categories.filter((c) => c.kind === "expense") },
    { label: "Income", items: categories.filter((c) => c.kind === "income") },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            Group your income and spending. Deleting a category keeps its past
            transactions — they become uncategorized.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field>
                <FieldLabel htmlFor="c-name">Name</FieldLabel>
                <Input id="c-name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field>
                <FieldLabel>Kind</FieldLabel>
                <Controller
                  control={control}
                  name="kind"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          {(value) => (value === "income" ? "Income" : "Expense")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              Add category
            </Button>
          </FieldGroup>
        </form>

        <div className="mt-2 max-h-64 space-y-4 overflow-y-auto">
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-sm">No categories yet.</p>
          ) : (
            groups.map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.label}>
                  <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                    {group.label}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((category) => (
                      <li
                        key={category.id}
                        className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                      >
                        <span className="truncate font-medium">
                          {category.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${category.name}`}
                          disabled={pending}
                          onClick={() => setConfirmTarget(category)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )
          )}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Delete this category?"
        description={
          confirmTarget
            ? `"${confirmTarget.name}" and any monthly budgets set for it will be deleted. Its past transactions are kept but become uncategorized.`
            : undefined
        }
        confirmLabel="Delete category"
        onConfirm={() => {
          if (confirmTarget) remove(confirmTarget.id)
        }}
      />
    </Dialog>
  )
}
