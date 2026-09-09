"use client"

import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { changePassword } from "@/modules/account/actions"
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/modules/account/validation"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { SettingsSection } from "./settings-section"

/**
 * Changing the password — the Security page.
 *
 * Lifted out of the Account card, where it sat under a sub-heading beneath the profile
 * form. It was always its own form with its own schema and action, so nothing about how
 * it saves changed; it simply has a page now, and room to be joined by whatever else
 * turns out to be about keeping the account safe rather than about who it belongs to.
 */
export function SecuritySection() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: standardSchemaResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await changePassword(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof ChangePasswordInput, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Password changed")
    reset()
  })

  return (
    <SettingsSection
      title="Security"
      description="Your sign-in. There is one account and one password; this is where it changes."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            <FieldError errors={[errors.currentPassword]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="newPassword">New password</FieldLabel>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...register("newPassword")}
              />
              <FieldError errors={[errors.newPassword]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">
                Confirm new password
              </FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
          </div>
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Changing…" : "Change password"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
