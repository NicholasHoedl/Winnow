"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { signOutAction } from "@/app/(app)/actions"
import { updateProfile } from "@/modules/account/actions"
import { profileSchema, type ProfileInput } from "@/modules/account/validation"
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
        {/* The password form lived here under its own sub-heading until Settings split
            into pages; it is `SecuritySection` now. Sign-out stays, because it is about
            THIS device's session rather than the account's credentials — and because it
            is the only way out below 768px, which the note below explains. */}
        <Separator />
        {/* The ONLY way to sign out below 768px, and until this existed there was none.
            `app-sidebar.tsx` is `hidden md:flex`, the bottom nav carries destinations
            rather than actions, and nothing else in the app called `signOutAction` — so a
            phone could sign in and never sign out. Worse once it is installed to the home
            screen (deploy runbook §7), where there is no browser chrome to fall back on.

            Here rather than in the mobile header: that row is already three icon buttons
            wide at 393px, and sign-out is not something you want a thumb finding by
            accident next to the theme toggle. The sidebar keeps its own copy — this adds a
            route to the action, it does not move it. */}
        <div>
          <h3 className="mb-1 text-sm font-semibold">Sign out</h3>
          <p className="text-muted-foreground mb-3 text-xs">
            Ends this session on this device. Your data stays where it is.
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </SettingsSection>
  )
}
