"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  CURRENCIES,
  BALANCE_TARGET_OPTIONS,
  CALENDAR_VIEW_OPTIONS,
  MOMENTUM_OPTIONS,
  SLATE_HORIZON_OPTIONS,
  PRIORITY_OPTIONS,
  WEEK_START_OPTIONS,
  timeZoneOptions,
  type UserPreferences,
} from "@/lib/preferences"
import { setUserPreferences } from "@/modules/preferences/actions"
import {
  userPreferencesSchema,
  type UserPreferencesInput,
} from "@/modules/preferences/validation"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Segmented } from "./segmented"
import { SettingsSection } from "./settings-section"

const TIME_FORMAT_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: false, label: "12-hour" },
  { value: true, label: "24-hour" },
]

export function PreferencesSection({
  preferences,
}: {
  preferences: UserPreferences
}) {
  const router = useRouter()
  const zones = timeZoneOptions()
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<UserPreferencesInput>({
    resolver: standardSchemaResolver(userPreferencesSchema),
    defaultValues: preferences,
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await setUserPreferences(data)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Preferences saved")
    // Timezone / week-start / currency / time-format re-render server + client.
    router.refresh()
  })

  return (
    <SettingsSection
      title="Preferences"
      description="Regional formatting and defaults."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="tz-trigger">Time zone</FieldLabel>
            <Controller
              control={control}
              name="timeZone"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger id="tz-trigger" className="w-full">
                    <SelectValue>
                      {(val) =>
                        (val as string)?.replace(/_/g, " ") || "Select…"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="cur-trigger">Currency</FieldLabel>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger id="cur-trigger" className="w-full">
                    <SelectValue>
                      {(val) =>
                        CURRENCIES.find((c) => c.code === val)?.label ??
                        (val as string)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field>
            <FieldLabel>Week starts on</FieldLabel>
            <Controller
              control={control}
              name="weekStartsOn"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={WEEK_START_OPTIONS}
                  label="Week starts on"
                />
              )}
            />
          </Field>

          <Field>
            <FieldLabel>Time format</FieldLabel>
            <Controller
              control={control}
              name="use24HourTime"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={TIME_FORMAT_OPTIONS}
                  label="Time format"
                />
              )}
            />
          </Field>

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
              grams account for the calories. Leave any of those three at 0 and
              your targets are left alone — a 0 means you aren&apos;t tracking
              it.
            </p>
          </Field>

          <Field>
            <FieldLabel>Highlighted events show</FieldLabel>
            <Controller
              control={control}
              name="slateHorizonDays"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={SLATE_HORIZON_OPTIONS}
                  label="Highlighted events show"
                />
              )}
            />
            <p className="text-muted-foreground text-xs">
              How far ahead the dashboard reaches for events you&apos;ve
              highlighted. Today and tomorrow always show everything, so this
              only decides how early a highlighted event turns up.
            </p>
          </Field>

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

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
