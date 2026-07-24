"use client"

import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormWatch,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { numberField } from "@/lib/forms"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { TaskFormValues } from "./task-dialog"

const REPEAT_LABELS = {
  none: "Off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} as const

const INTERVAL_UNIT = { daily: "days", weekly: "weeks", monthly: "months" } as const

const WEEKDAY_TOGGLES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const ORDINALS = ["first", "second", "third", "fourth", "fifth"]

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD, or -1 if unparseable. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Google-style labels for the two monthly modes, derived from the start date. */
function monthlyLabels(date: string): { dayOfMonth: string; nthWeekday: string } {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return { dayOfMonth: "the same day", nthWeekday: "the same weekday" }
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const which = d + 7 > daysInMonth ? "last" : (ORDINALS[Math.ceil(d / 7) - 1] ?? "last")
  return { dayOfMonth: `day ${d}`, nthWeekday: `the ${which} ${WEEKDAY_NAMES[dow]}` }
}

/** The "Repeat" section of the task dialog. Renders only the Repeat select until a
 *  frequency is chosen. Reused for both creating a rule and editing a series. */
export function TaskRecurrenceFields({
  control,
  register,
  watch,
  errors,
}: {
  control: Control<TaskFormValues>
  register: UseFormRegister<TaskFormValues>
  watch: UseFormWatch<TaskFormValues>
  errors: FieldErrors<TaskFormValues>
}) {
  const repeat = watch("repeat")
  const flexible = watch("flexible")
  const startDate = watch("startDate")

  return (
    <>
      <Field>
        <FieldLabel>Repeat</FieldLabel>
        <Controller
          control={control}
          name="repeat"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => REPEAT_LABELS[value as keyof typeof REPEAT_LABELS]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REPEAT_LABELS) as (keyof typeof REPEAT_LABELS)[]).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {REPEAT_LABELS[key]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {repeat !== "none" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="tr-interval">
                Every ({INTERVAL_UNIT[repeat]})
              </FieldLabel>
              <Input
                id="tr-interval"
                type="number"
                min="1"
                {...register("recurrenceInterval", numberField)}
              />
              <FieldError errors={[errors.recurrenceInterval]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tr-start">Starts</FieldLabel>
              <Input id="tr-start" type="date" {...register("startDate")} />
              <FieldError errors={[errors.startDate]} />
            </Field>
          </div>

          {repeat !== "daily" && (
            <Controller
              control={control}
              name="flexible"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  Any day within the {repeat === "weekly" ? "week" : "month"} (once per{" "}
                  {repeat === "weekly" ? "week" : "month"})
                </label>
              )}
            />
          )}

          {repeat === "weekly" && !flexible && (
            <Field>
              <FieldLabel>On days</FieldLabel>
              <Controller
                control={control}
                name="weekdays"
                render={({ field }) => {
                  const startWd = weekdayOf(startDate)
                  const mask =
                    field.value === 0 && startWd >= 0 ? 1 << startWd : field.value
                  return (
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_TOGGLES.map((label, wd) => {
                        const on = (mask & (1 << wd)) !== 0
                        return (
                          <button
                            key={wd}
                            type="button"
                            aria-pressed={on}
                            aria-label={WEEKDAY_NAMES[wd]}
                            onClick={() => field.onChange(mask ^ (1 << wd))}
                            className={cn(
                              "size-9 rounded-md text-xs font-medium transition-colors",
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )
                }}
              />
            </Field>
          )}

          {repeat === "monthly" && !flexible && (
            <Field>
              <FieldLabel>On</FieldLabel>
              <Controller
                control={control}
                name="monthlyMode"
                render={({ field }) => {
                  const labels = monthlyLabels(startDate)
                  const options = [
                    { value: "day_of_month" as const, label: labels.dayOfMonth },
                    { value: "nth_weekday" as const, label: labels.nthWeekday },
                  ]
                  return (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={field.value === option.value}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                            field.value === option.value
                              ? "border-primary ring-primary/30 ring-2"
                              : "border-border hover:bg-accent",
                          )}
                        >
                          On {option.label}
                        </button>
                      ))}
                    </div>
                  )
                }}
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="tr-until">Until (optional)</FieldLabel>
            <Input id="tr-until" type="date" {...register("endDate")} />
            <FieldError errors={[errors.endDate]} />
          </Field>
        </>
      )}
    </>
  )
}
