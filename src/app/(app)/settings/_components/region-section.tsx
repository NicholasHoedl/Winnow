"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  CURRENCIES,
  DATE_FORMAT_OPTIONS,
  VOLUME_UNIT_OPTIONS,
  WEEK_START_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
  timeZoneOptions,
  type UserPreferences,
} from "@/lib/preferences"
import { setRegionPreferences } from "@/modules/preferences/actions"
import {
  regionPreferencesSchema,
  type RegionPreferencesInput,
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

import { Segmented } from "@/components/shared/segmented"
import { SettingsSection } from "./settings-section"

const TIME_FORMAT_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: false, label: "12-hour" },
  { value: true, label: "24-hour" },
]

/**
 * The seven regional preferences — how a date, a time, money and a weight READ.
 *
 * Half of what was `PreferencesSection`: fifteen fields behind one Save button, which its
 * own schema note said to split by subject if it grew. The form is typed against
 * `regionPreferencesSchema` alone and `setRegionPreferences` writes only those keys, so
 * saving here cannot touch anything the Defaults page owns — the same arrangement
 * Notifications and Appearance already had.
 *
 * `defaultValues: preferences` hands the whole row to react-hook-form; the resolver's
 * schema strips it to these seven on submit, so the extra keys never reach the action.
 */
export function RegionSection({
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
  } = useForm<RegionPreferencesInput>({
    resolver: standardSchemaResolver(regionPreferencesSchema),
    defaultValues: preferences,
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await setRegionPreferences(data)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Region saved")
    // Time zone / week start / currency / time format re-render server + client.
    router.refresh()
  })

  return (
    <SettingsSection
      title="Region"
      description="How dates, times, money and measurements read. Nothing stored changes — only how it is shown."
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
            <FieldLabel>Date format</FieldLabel>
            <Controller
              control={control}
              name="dateFormat"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={DATE_FORMAT_OPTIONS}
                  label="Date format"
                />
              )}
            />
            <p className="text-muted-foreground text-xs">
              Which way round a date reads. Month names stay English either way
              — this changes the order, not the language.
            </p>
          </Field>

          <Field>
            <FieldLabel>Weight</FieldLabel>
            <Controller
              control={control}
              name="weightUnit"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={WEIGHT_UNIT_OPTIONS}
                  label="Weight"
                />
              )}
            />
          </Field>

          <Field>
            <FieldLabel>Water</FieldLabel>
            <Controller
              control={control}
              name="volumeUnit"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={VOLUME_UNIT_OPTIONS}
                  label="Water"
                />
              )}
            />
            <p className="text-muted-foreground text-xs">
              Both are converted for display only. What is stored never changes,
              so switching back and forth cannot alter a figure you logged.
            </p>
          </Field>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save region"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
