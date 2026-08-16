"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import type { UserPreferences } from "@/lib/preferences"
import { setNotificationPreferences } from "@/modules/preferences/actions"
import {
  notificationPreferencesSchema,
  type NotificationPreferencesInput,
} from "@/modules/preferences/validation"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

import { Segmented } from "./segmented"
import { SettingsSection } from "./settings-section"

const DIGEST_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
]

export function NotificationsSection({
  preferences,
}: {
  preferences: UserPreferences
}) {
  const router = useRouter()
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<NotificationPreferencesInput>({
    resolver: standardSchemaResolver(notificationPreferencesSchema),
    // Only the notification fields — this form must not carry (and therefore
    // can't overwrite) the regional preferences the section above owns.
    defaultValues: { digestEnabled: preferences.digestEnabled },
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await setNotificationPreferences(data)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Notification settings saved")
    router.refresh()
  })

  return (
    <SettingsSection
      title="Notifications"
      description="What Winnow surfaces when you open it."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Daily digest</FieldLabel>
            <Controller
              control={control}
              name="digestEnabled"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={DIGEST_OPTIONS}
                  label="Daily digest"
                />
              )}
            />
            <p className="text-muted-foreground text-sm">
              A once-a-day summary of what needs you — overdue and due tasks,
              today&apos;s events, and any macro targets still open. Shown the
              first time you open Winnow each day.
            </p>
          </Field>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save notifications"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
