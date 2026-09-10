"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import * as React from "react"

import {
  BALANCE_TARGET_OPTIONS,
  CALENDAR_CARD_VIEW_OPTIONS,
  CALENDAR_VIEW_OPTIONS,
  MEAL_TYPES,
  MOMENTUM_OPTIONS,
  ON_OFF_OPTIONS,
  PRIORITY_OPTIONS,
  SLATE_HORIZON_OPTIONS,
  type UserPreferences,
  type WeightUnit,
} from "@/lib/preferences"
import {
  fromDisplayWeight,
  toDisplayWeight,
  weightUnitLabel,
} from "@/lib/format"
import { navItems } from "@/components/shared/nav-items"
import type { List } from "@/modules/todos/queries"
import { setDefaultPreferences } from "@/modules/preferences/actions"
import {
  defaultPreferencesSchema,
  type DefaultPreferencesInput,
} from "@/modules/preferences/validation"
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
import { Separator } from "@/components/ui/separator"

import { Segmented } from "@/components/shared/segmented"
import { SettingsSection } from "./settings-section"

/** A Select item cannot carry an empty value — the same sentinel the link pickers use. */
const NO_MEAL_TYPE = "__none__"
const NO_LIST = "__none__"

const MEAL_TYPE_LABELS: Record<string, string> = {
  other: "Other",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
}

/**
 * The goal weight, typed in the DISPLAYED unit and stored in pounds.
 *
 * Its own text state rather than a controlled input over the converted number: converting
 * on every keystroke turns "174." back into "174" and eats the decimal point as it is
 * typed. The form only ever sees pounds or null, which is what the schema validates.
 */
function GoalWeightInput({
  value,
  onChange,
  unit,
}: {
  value: number | null
  onChange: (lb: number | null) => void
  unit: WeightUnit
}) {
  const [text, setText] = React.useState(
    value === null
      ? ""
      : String(Number(toDisplayWeight(value, unit).toFixed(1))),
  )
  return (
    <div className="flex items-center gap-2">
      <Input
        id="goal-weight"
        type="number"
        step="0.1"
        inputMode="decimal"
        placeholder="—"
        value={text}
        onChange={(event) => {
          const raw = event.target.value
          setText(raw)
          const entered = Number(raw.trim())
          onChange(
            raw.trim() === "" || Number.isNaN(entered)
              ? null
              : fromDisplayWeight(entered, unit),
          )
        }}
        className="max-w-40 tabular-nums"
      />
      <span className="text-muted-foreground text-xs">
        {weightUnitLabel(unit)}
      </span>
    </div>
  )
}

/**
 * A sub-heading inside the card, so eight fields from five parts of the app read as five
 * short lists rather than one long one. The same `h3` the Account card used to separate
 * its password form, so the two pages agree about what a subdivision looks like.
 */
function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

/**
 * The eight preferences that change what the app DOES for you, grouped by the part of
 * the app each one drives.
 *
 * The other half of what was `PreferencesSection` — see `RegionSection` for the split and
 * why each page has a schema of its own. Grouped by module rather than listed flat because
 * "which page does this affect" is how you look for a setting like this: a person changing
 * what quick-add does with a meal is thinking about Meals, not about defaults.
 */
export function DefaultsSection({
  preferences,
  lists,
}: {
  preferences: UserPreferences
  /** For the default-list picker. */
  lists: List[]
}) {
  const router = useRouter()
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DefaultPreferencesInput>({
    resolver: standardSchemaResolver(defaultPreferencesSchema),
    defaultValues: preferences,
  })
  // The goal only means something while weight is tracked. `useWatch`, not `watch()`:
  // the compiler-compatibility lint flags the latter, and this file had none to flag.
  const trackWeight = useWatch({ control, name: "trackWeight" })

  const onSubmit = handleSubmit(async (data) => {
    const result = await setDefaultPreferences(data)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Defaults saved")
    router.refresh()
  })

  return (
    <SettingsSection
      title="Defaults"
      description="What the app does unless you say otherwise — where it opens, what it files things under, how it judges a goal."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Group title="Dashboard">
            <Field>
              <FieldLabel>Start on</FieldLabel>
              <Controller
                control={control}
                name="landingPage"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    <SelectTrigger id="landing-trigger" className="w-full">
                      <SelectValue>
                        {(val) =>
                          navItems.find((item) => item.href === val)?.label ??
                          "Dashboard"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {navItems.map((item) => (
                        <SelectItem key={item.href} value={item.href}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-xs">
                Where signing in takes you.
              </p>
            </Field>

            <Field>
              <FieldLabel>Dashboard calendar opens on</FieldLabel>
              <Controller
                control={control}
                name="dashboardCalendarView"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={CALENDAR_CARD_VIEW_OPTIONS}
                    label="Dashboard calendar opens on"
                  />
                )}
              />
              {/* Every other field here carries a hint and this one did not, which mattered
                  more here than anywhere else: the card it controls is `hidden lg:flex` on
                  the dashboard, so below 1024px this setting is still stored, still saved,
                  and changes nothing you can see. Saying so beats leaving someone to wonder
                  whether it is broken. */}
              <p className="text-muted-foreground text-xs">
                The dashboard&apos;s calendar card, which needs a wide window —
                phones and narrow screens don&apos;t show it.
              </p>
            </Field>

            <Field>
              <FieldLabel>Tracked events show</FieldLabel>
              <Controller
                control={control}
                name="slateHorizonDays"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={SLATE_HORIZON_OPTIONS}
                    label="Tracked events show"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                How far ahead the dashboard looks for events you track. Only
                tracked events reach the dashboard; the rest stay on the
                calendar.
              </p>
            </Field>
          </Group>

          <Separator />

          <Group title="Calendar">
            <Field>
              <FieldLabel>Calendar opens on</FieldLabel>
              <Controller
                control={control}
                name="defaultCalendarView"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={CALENDAR_VIEW_OPTIONS}
                    label="Calendar opens on"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                Which view the calendar starts on. A link with a view in it — a
                search result, or one you bookmarked — still wins.
              </p>
            </Field>
          </Group>

          <Separator />

          <Group title="Activity">
            <Field>
              <FieldLabel>Default task priority</FieldLabel>
              <Controller
                control={control}
                name="defaultTaskPriority"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={PRIORITY_OPTIONS}
                    label="Default task priority"
                  />
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="default-list-trigger">
                Default list
              </FieldLabel>
              <Controller
                control={control}
                name="defaultListId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_LIST}
                    onValueChange={(v) =>
                      field.onChange(v === NO_LIST ? null : v)
                    }
                  >
                    <SelectTrigger id="default-list-trigger" className="w-full">
                      <SelectValue>
                        {(val) =>
                          lists.find((list) => list.id === val)?.name ??
                          "No list"
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
              <p className="text-muted-foreground text-xs">
                Where a new task is filed unless you pick another — the dialog
                opens on it, and quick-add uses it when you don&apos;t type a
                #list.
              </p>
            </Field>
          </Group>

          <Separator />

          <Group title="Goals">
            <Field>
              <FieldLabel>Goal momentum window</FieldLabel>
              <Controller
                control={control}
                name="goalMomentumDays"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={MOMENTUM_OPTIONS}
                    label="Goal momentum window"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                How far back a goal looks for finished work. A goal with nothing
                completed in this window reads as stalled.
              </p>
            </Field>
          </Group>

          <Separator />

          <Group title="Meals">
            <Field>
              <FieldLabel>Quick-added meals go to</FieldLabel>
              <Controller
                control={control}
                name="defaultMealType"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_MEAL_TYPE}
                    onValueChange={(v) =>
                      field.onChange(v === NO_MEAL_TYPE ? null : v)
                    }
                  >
                    <SelectTrigger id="meal-type-trigger" className="w-full">
                      <SelectValue>
                        {(val) =>
                          MEAL_TYPE_LABELS[val as string] ??
                          MEAL_TYPE_LABELS.other
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MEAL_TYPE}>
                        {MEAL_TYPE_LABELS.other}
                      </SelectItem>
                      {MEAL_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {MEAL_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field>
              <FieldLabel>Balance macro targets</FieldLabel>
              <Controller
                control={control}
                name="balanceMacroTargets"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={BALANCE_TARGET_OPTIONS}
                    label="Balance macro targets"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                Work out your carbs from your calories, protein and fat so the
                grams account for the calories. Leave any of those three at 0
                and your targets are left alone — a 0 means you aren&apos;t
                tracking it.
              </p>
            </Field>

            <Field>
              <FieldLabel>Track body weight</FieldLabel>
              <Controller
                control={control}
                name="trackWeight"
                render={({ field }) => (
                  <Segmented
                    value={field.value}
                    onChange={field.onChange}
                    options={ON_OFF_OPTIONS}
                    label="Track body weight"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                Off hides the weigh-in card and the trend on Meals, and the
                weight line on the dashboard. Nothing you have logged is
                deleted.
              </p>
            </Field>

            {trackWeight && (
              <Field>
                <FieldLabel htmlFor="goal-weight">Goal weight</FieldLabel>
                <Controller
                  control={control}
                  name="goalWeightLb"
                  render={({ field }) => (
                    <GoalWeightInput
                      value={field.value ?? null}
                      onChange={field.onChange}
                      unit={preferences.weightUnit}
                    />
                  )}
                />
                <FieldError errors={[errors.goalWeightLb]} />
                <p className="text-muted-foreground text-xs">
                  Shown beside the trend as how far there is to go, and about
                  how long at the current rate. Leave it blank for none.
                </p>
              </Field>
            )}
          </Group>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save defaults"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
