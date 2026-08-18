"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { changePassword, updateProfile } from "@/modules/account/actions"
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from "@/modules/account/validation"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import { SettingsSection } from "./settings-section"

function ProfileForm({
  defaultName,
  email,
}: {
  defaultName: string
  email: string
}) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: standardSchemaResolver(profileSchema),
    defaultValues: { displayName: defaultName },
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateProfile(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof ProfileInput, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Profile updated")
    // The action set a fresh JWT cookie; refresh so the sidebar + greeting
    // re-render with the new name (the post-action render used the old cookie).
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="displayName">Display name</FieldLabel>
          <Input
            id="displayName"
            autoComplete="name"
            {...register("displayName")}
          />
          <FieldError errors={[errors.displayName]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" value={email} disabled readOnly />
          {/* "can't be changed here" implied a somewhere-else. There isn't one: there is no
              sign-up, no reset flow, and `scripts/seed-user.ts` is the only thing that has
              ever created an account. The phrasing was inherited from products that have
              account management; this one says what is actually true. */}
          <p className="text-muted-foreground text-xs">
            Your sign-in email is fixed.
          </p>
        </Field>
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

function PasswordForm() {
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
  )
}

export function AccountSection({
  defaultName,
  email,
}: {
  defaultName: string
  email: string
}) {
  return (
    <SettingsSection title="Account">
      <div className="flex flex-col gap-6">
        <ProfileForm defaultName={defaultName} email={email} />
        <Separator />
        <div>
          <h3 className="mb-3 text-sm font-semibold">Change password</h3>
          <PasswordForm />
        </div>
      </div>
    </SettingsSection>
  )
}
