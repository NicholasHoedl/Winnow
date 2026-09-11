"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/modules/budget/actions"
import type { Category } from "@/modules/budget/queries"
import { categoryInputSchema } from "@/modules/budget/validation"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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

import { BudgetHeader } from "../../_components/budget-header"

type CategoryFormValues = {
  name: string
  kind: "income" | "expense"
  /** What belongs here, for the AI (T33). "" in the form, NULL in the row. */
  description?: string | null
}

const EMPTY: CategoryFormValues = { name: "", kind: "expense", description: "" }

/**
 * The Categories page: the form above the list, doubling as the edit form —
 * `CalendarManager`'s shape, and the "Manage categories" dialog's until T30 made it a
 * page of its own (ADR-0024).
 *
 * `month` is not read here — a category has no month — but it rides on the strip's pills,
 * so a round trip through this page keeps the month the others were showing.
 */
export function CategoriesView({
  categories,
  month,
}: {
  categories: Category[]
  month: string | null
}) {
  const [pending, startTransition] = React.useTransition()
  const [confirmTarget, setConfirmTarget] = React.useState<Category | null>(
    null,
  )
  const [editingId, setEditingId] = React.useState<string | null>(null)
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
    const result = editingId
      ? await updateCategory(editingId, data)
      : await createCategory(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof CategoryFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(editingId ? "Category updated" : "Category added")
    setEditingId(null)
    reset(EMPTY)
  })

  /**
   * `kind` is loaded into the form even though the edit path will not let you change it —
   * `updateCategory` does `.set(parsed.data)`, so omitting it would rewrite every edited
   * category as an expense. Same reason `food-manager.tsx` carries `barcode` through an
   * edit that never shows it.
   */
  function startEdit(category: Category) {
    setEditingId(category.id)
    reset({
      name: category.name,
      kind: category.kind,
      description: category.description ?? "",
    })
  }

  function cancelEdit() {
    setEditingId(null)
    reset(EMPTY)
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteCategory(id)
      if (!result.ok) toast.error(result.error)
      else if (editingId === id) cancelEdit()
    })
  }

  const groups = [
    { label: "Expense", items: categories.filter((c) => c.kind === "expense") },
    { label: "Income", items: categories.filter((c) => c.kind === "income") },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        month={month}
        description="Group your income and spending. A category can be renamed; deleting one keeps its past transactions — they become uncategorized. A description tells the receipt scanner what belongs in it."
      />

      <form onSubmit={onSubmit} className="max-w-xl">
        <FieldGroup>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field>
              <FieldLabel htmlFor="c-name">Name</FieldLabel>
              <Input id="c-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="c-kind">Kind</FieldLabel>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                    // Locked while editing, deliberately. Flipping a kind under
                    // existing transactions leaves them pointing at a category that no
                    // longer matches their type: the transaction dialog filters its
                    // picker by kind, so re-opening one of those transactions silently
                    // drops its category, and the Budgets page stops offering the
                    // category a limit. Allowing it needs a migration path for the rows
                    // that already reference it, which renaming does not.
                    disabled={editingId !== null}
                  >
                    <SelectTrigger id="c-kind" className="w-32">
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
          <Field>
            <FieldLabel htmlFor="c-desc">Description</FieldLabel>
            {/* Read by the AI when it sorts a receipt's lines (T33): the names alone cannot
                say where a pack of trading cards goes, and the categories are the user's
                to add and rename, so the note lives beside the name. Optional. */}
            <Input
              id="c-desc"
              placeholder="e.g. groceries and household staples — helps the receipt scanner"
              {...register("description")}
            />
            <FieldError errors={[errors.description]} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {editingId ? "Save category" : "Add category"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>

      <div className="mt-6 max-w-xl space-y-4">
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">No categories yet.</p>
        ) : (
          groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.label}>
                <h2 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                  {group.label}
                </h2>
                <ul className="flex flex-col gap-1">
                  {group.items.map((category) => (
                    <li
                      key={category.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {category.name}
                        </span>
                        {category.description && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {category.description}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${category.name}`}
                          onClick={() => startEdit(category)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${category.name}`}
                          disabled={pending}
                          onClick={() => setConfirmTarget(category)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )
        )}
      </div>

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
    </div>
  )
}
