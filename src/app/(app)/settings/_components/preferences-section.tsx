"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  CURRENCIES,
  MOMENTUM_OPTIONS,
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
                />
              )}
            />
            <p className="text-muted-foreground text-xs">
              How far back a goal looks for finished work. A goal with nothing
              completed in this window reads as stalled.
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
