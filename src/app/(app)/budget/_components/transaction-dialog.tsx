"use client"

import * as React from "react"
import { Controller, useForm, type Resolver } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  createTransaction,
  createTransactionRecurrence,
  updateTransaction,
  updateTransactionRecurrence,
} from "@/modules/budget/actions"
import type { Category, TransactionWithSeries } from "@/modules/budget/queries"
import {
  currencyFractionDigits,
  currencySymbol,
  minorToAmount,
} from "@/modules/budget/service"
import {
  MAX_INITIAL_POSTS,
  transactionInputSchema,
  type TransactionInput,
} from "@/modules/budget/validation"
import type { ActionResult } from "@/lib/action-result"
import { addDays, daysInMonth, fmt, isValidDateString } from "@/lib/date"
import { numberField } from "@/lib/forms"
import { cyclesInRange } from "@/lib/recurrence"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { RecurrenceFields } from "@/components/shared/recurrence-fields"
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

const NO_CATEGORY = "__none__"

// The superset the dialog binds to: a one-off transaction plus, when creating, the
// schedule that would turn it into a recurring rule. `flexible` is deliberately
// absent — an auto-posted bill has no "sometime this week" mode.
type TransactionFormValues = {
  amount: number
  type: "income" | "expense"
  date: string
  categoryId?: string
  payee?: string
  description?: string
  repeat: "none" | "daily" | "weekly" | "monthly"
  recurrenceInterval: number
  weekdays: number
  monthlyMode: "day_of_month" | "nth_weekday"
  startDate: string
  endDate?: string
}

/** `date` follows the month being viewed; `startDate` never does — a back-dated
 *  schedule would catch up across every month since, which is rarely the intent. */
function emptyValues(
  defaultDate: string,
  today: string,
): TransactionFormValues {
  return {
    amount: 0,
    type: "expense",
    date: defaultDate,
    categoryId: "",
    payee: "",
    description: "",
    repeat: "none",
    recurrenceInterval: 1,
    weekdays: 0,
    monthlyMode: "day_of_month",
    startDate: today,
    endDate: "",
  }
}

/** The rule payload (createTransactionRecurrence validates it server-side). `freq` is
 *  passed separately because only the caller knows `repeat` isn't "none" there. */
function toRecurrenceInput(
  v: TransactionFormValues,
  freq: "daily" | "weekly" | "monthly",
) {
  return {
    amount: v.amount,
    type: v.type,
    categoryId: v.categoryId,
    payee: v.payee,
    description: v.description,
    freq,
    recurrenceInterval: v.recurrenceInterval,
    weekdays: v.weekdays,
    monthlyMode: v.monthlyMode,
    startDate: v.startDate,
    endDate: v.endDate,
  }
}

export function TransactionDialog({
  defaultDate,
  month,
  today,
  categories,
  transaction,
  open,
  onOpenChange,
}: {
  defaultDate: string
  month: string
  /** The user's local today — the horizon the catch-up preview counts up to. */
  today: string
  categories: Category[]
  transaction: TransactionWithSeries | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!transaction
  const series = transaction?.series ?? null
  const isRecurring = !!series
  /**
   * Which thing an edit is about — the posted row, or the rule that posted it.
   *
   * The same toggle `TaskDialog` carries, and the reason it is needed here is the older
   * comment two screens down: "editing a posted row edits that row — the ledger is a
   * record of what happened, not a template". That is still true of the row, and it left
   * the TEMPLATE unreachable. Changing the rent from 1200 to 1300 meant stopping the rule
   * and rebuilding the schedule from memory.
   */
  const [scope, setScope] = React.useState<"this" | "series">("this")
  const isSeriesEdit = isRecurring && scope === "series"
  const { currency, weekStartsOn } = usePreferences()
  const symbol = currencySymbol(currency)
  const step = currencyFractionDigits(currency) === 0 ? "1" : "0.01"

  // Constrain the date picker to the month being viewed so an entry can't silently
  // land in another month (which decides where it shows up). The recurrence start/end
  // fields are deliberately NOT clamped — a schedule outlives the month you set it in.
  const [my, mm] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const monthEnd = fmt(my, mm, daysInMonth(my, mm))

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues, unknown, TransactionInput>({
    // The form is a superset of this schema — it also carries the schedule — and RHF's
    // Resolver is invariant in the form type, hence the cast. The third type argument
    // is the honest consequence: the resolver strips the schedule fields, so what
    // handleSubmit receives is a TransactionInput, not the whole form. The rule path
    // reads getValues() for exactly that reason. Schedule fields are validated
    // server-side by transactionRecurrenceSchema and come back as fieldErrors.
    resolver: standardSchemaResolver(
      transactionInputSchema,
    ) as unknown as Resolver<TransactionFormValues, unknown, TransactionInput>,
    defaultValues: emptyValues(defaultDate, today),
  })

  // A category belongs to either income or expense; show only the matching kind,
  // and drop a selected category that no longer fits when the type flips.
  const txType = watch("type")
  const availableCategories = categories.filter((c) => c.kind === txType)
  React.useEffect(() => {
    const selected = getValues("categoryId")
    if (
      selected &&
      !categories.some((c) => c.id === selected && c.kind === txType)
    ) {
      setValue("categoryId", "")
    }
  }, [txType, categories, getValues, setValue])

  // Reset the scope when the dialog (re)opens — during render, so the effect below sees
  // the right scope on its first commit. `TaskDialog` does this identically.
  const openKeyRef = React.useRef<string | null>(null)
  const openKey = open ? (transaction?.id ?? "new") : null
  if (openKey !== openKeyRef.current) {
    openKeyRef.current = openKey
    if (openKey !== null) setScope("this")
  }

  React.useEffect(() => {
    if (!open) return
    if (series && scope === "series") {
      // The rule's own values. `date` stays empty: a schedule has a start and an end, not
      // a date, and the field is hidden in this mode for exactly that reason.
      reset({
        ...emptyValues(defaultDate, today),
        amount: minorToAmount(series.amountCents, currency),
        type: series.type,
        categoryId: series.categoryId ?? "",
        payee: series.payee ?? "",
        description: series.description ?? "",
        repeat: series.freq,
        recurrenceInterval: series.recurrenceInterval,
        weekdays: series.weekdays,
        monthlyMode: series.monthlyMode,
        startDate: series.startDate,
        endDate: series.endDate ?? "",
      })
      return
    }
    if (transaction) {
      reset({
        ...emptyValues(defaultDate, today),
        amount: minorToAmount(transaction.amountCents, currency),
        type: transaction.type,
        date: transaction.date,
        categoryId: transaction.categoryId ?? "",
        payee: transaction.payee ?? "",
        description: transaction.description ?? "",
      })
    } else {
      reset(emptyValues(defaultDate, today))
    }
  }, [open, transaction, series, scope, defaultDate, today, currency, reset])

  const onSubmit = handleSubmit(async (data) => {
    // The resolver strips the schedule fields from `data`, so the rule path reads the
    // raw form values instead.
    const v = getValues()
    let result: ActionResult
    if (series && scope === "series") {
      if (v.repeat === "none") {
        // "Off" on a rule reads as "stop repeating", and turning an edit into a deletion
        // is not something a Save button should do quietly. The row's menu has that.
        setError("repeat", {
          message:
            'Pick a frequency, or use "Stop repeating" to end the schedule.',
        })
        return
      }
      result = await updateTransactionRecurrence(
        series.id,
        toRecurrenceInput(v, v.repeat),
      )
    } else if (isEdit) {
      result = await updateTransaction(transaction.id, data)
    } else if (v.repeat === "none") {
      result = await createTransaction(data)
    } else {
      result = await createTransactionRecurrence(toRecurrenceInput(v, v.repeat))
    }

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TransactionFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(
      isSeriesEdit
        ? "Schedule updated"
        : isEdit
          ? "Transaction updated"
          : v.repeat === "none"
            ? "Transaction added"
            : "Repeating transaction added",
    )
    onOpenChange(false)
  })

  // Editing a POSTED ROW still edits only that row — the ledger records what happened,
  // not what was planned. The schedule behind it is reachable through the scope toggle,
  // which is a different thing to be editing and says so.
  const repeat = watch("repeat")
  const interval = watch("recurrenceInterval")
  const weekdays = watch("weekdays")
  const monthlyMode = watch("monthlyMode")
  const startDate = watch("startDate")
  const endDate = watch("endDate")

  // How many rows saving right now would post. A back-dated start is the foot-gun this
  // defuses — the same pure engine the server materializer runs, so the count matches.
  // Create-only, including in series mode: `updateTransactionRecurrence` advances
  // `postedThrough` when the schedule changes rather than back-posting, so an edited rule
  // adds nothing at once and a count would be a number the save will not produce.
  const pending = React.useMemo(() => {
    if (isEdit || repeat === "none" || !isValidDateString(startDate))
      return null
    if (endDate && !isValidDateString(endDate)) return null
    return cyclesInRange(
      {
        freq: repeat,
        recurrenceInterval: Math.max(1, Math.floor(interval) || 1),
        weekdays,
        monthlyMode,
        startDate,
        endDate: endDate || null,
        flexible: false,
      },
      addDays(startDate, -1),
      today,
      weekStartsOn,
    ).length
  }, [
    isEdit,
    repeat,
    interval,
    weekdays,
    monthlyMode,
    startDate,
    endDate,
    today,
    weekStartsOn,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSeriesEdit
              ? "Edit repeating transaction"
              : isEdit
                ? "Edit transaction"
                : repeat === "none"
                  ? "Add transaction"
                  : "Add repeating transaction"}
          </DialogTitle>
          <DialogDescription>
            {isSeriesEdit
              ? "Changes apply to what it posts from here on. Transactions it already posted are left alone."
              : isEdit
                ? isRecurring
                  ? "Editing just this posted transaction."
                  : "Update this transaction."
                : repeat === "none"
                  ? "Record income or an expense."
                  : "Posts automatically each time it comes due."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {isRecurring && (
              <Field>
                <FieldLabel>Apply changes to</FieldLabel>
                <div className="flex gap-2">
                  {(
                    [
                      ["this", "This one"],
                      ["series", "Schedule"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scope === value}
                      onClick={() => setScope(value)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        scope === value
                          ? "border-primary ring-primary/30 ring-2"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="t-amount">Amount ({symbol})</FieldLabel>
                <Input
                  id="t-amount"
                  type="number"
                  step={step}
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
                          {(value) =>
                            value === "income" ? "Income" : "Expense"
                          }
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

            <div
              className={cn(
                "grid gap-4",
                repeat === "none" ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              {/* A schedule supplies its own dates, so the one-off date field would
                  only be a second, contradictory answer. */}
              {!isSeriesEdit && repeat === "none" && (
                <Field>
                  <FieldLabel htmlFor="t-date">Date</FieldLabel>
                  <Input
                    id="t-date"
                    type="date"
                    min={monthStart}
                    max={monthEnd}
                    {...register("date")}
                  />
                  <FieldError errors={[errors.date]} />
                </Field>
              )}
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_CATEGORY}
                      onValueChange={(value) =>
                        field.onChange(
                          value && value !== NO_CATEGORY ? value : "",
                        )
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
                        {availableCategories.map((category) => (
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
              <FieldLabel htmlFor="t-payee">Payee</FieldLabel>
              <Input
                id="t-payee"
                placeholder="Who it went to"
                {...register("payee")}
              />
              <FieldError errors={[errors.payee]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="t-desc">Description</FieldLabel>
              <Input
                id="t-desc"
                placeholder="Optional"
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            {(!isEdit || isSeriesEdit) && (
              <>
                <RecurrenceFields
                  control={control}
                  register={register}
                  watch={watch}
                  errors={errors}
                  idPrefix="t-rec"
                  showFlexible={false}
                />
                {pending !== null && (
                  <p
                    // The count changes as the schedule is edited, so announce it.
                    aria-live="polite"
                    className={cn(
                      "text-xs",
                      pending > MAX_INITIAL_POSTS
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {pending > MAX_INITIAL_POSTS
                      ? `That start date would add ${pending} transactions at once. Pick a later start date.`
                      : pending === 0
                        ? "Nothing is added yet — the first one posts on its start date."
                        : `Adds ${pending} ${pending === 1 ? "transaction" : "transactions"} now to catch up.`}
                  </p>
                )}
              </>
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
            <Button
              type="submit"
              // The action rejects this too; blocking here just saves the round-trip.
              disabled={isSubmitting || (pending ?? 0) > MAX_INITIAL_POSTS}
            >
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
