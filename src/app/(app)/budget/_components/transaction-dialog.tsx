"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { createTransaction, updateTransaction } from "@/modules/budget/actions"
import type { Category, Transaction } from "@/modules/budget/queries"
import { centsToDollars } from "@/modules/budget/service"
import { transactionInputSchema } from "@/modules/budget/validation"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NO_CATEGORY = "__none__"

type TransactionFormValues = {
  amount: number
  type: "income" | "expense"
  date: string
  categoryId?: string
  description?: string
}

export function TransactionDialog({
  defaultDate,
  categories,
  transaction,
  open,
  onOpenChange,
}: {
  defaultDate: string
  categories: Category[]
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!transaction
  const empty: TransactionFormValues = {
    amount: 0,
    type: "expense",
    date: defaultDate,
    categoryId: "",
    description: "",
  }
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: standardSchemaResolver(transactionInputSchema),
    defaultValues: empty,
  })

  React.useEffect(() => {
    if (!open) return
    if (transaction) {
      reset({
        amount: centsToDollars(transaction.amountCents),
        type: transaction.type,
        date: transaction.date,
        categoryId: transaction.categoryId ?? "",
        description: transaction.description ?? "",
      })
    } else {
      reset({
        amount: 0,
        type: "expense",
        date: defaultDate,
        categoryId: "",
        description: "",
      })
    }
  }, [open, transaction, defaultDate, reset])

  const onSubmit = handleSubmit(async (data) => {
    const result = isEdit
      ? await updateTransaction(transaction.id, data)
      : await createTransaction(data)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TransactionFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Transaction updated" : "Transaction added")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this transaction." : "Record income or an expense."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="t-amount">Amount ($)</FieldLabel>
                <Input
                  id="t-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("amount", numberField)}
                />
                <FieldError errors={[errors.amount]} />
              </Field>
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <SelectTrigger className="w-full">
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

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="t-date">Date</FieldLabel>
                <Input id="t-date" type="date" {...register("date")} />
                <FieldError errors={[errors.date]} />
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_CATEGORY}
                      onValueChange={(value) =>
                        field.onChange(value && value !== NO_CATEGORY ? value : "")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) =>
                            value && value !== NO_CATEGORY
                              ? (categories.find((c) => c.id === value)?.name ??
                                "No category")
                              : "No category"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="t-desc">Description</FieldLabel>
              <Input id="t-desc" placeholder="Optional" {...register("description")} />
              <FieldError errors={[errors.description]} />
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
