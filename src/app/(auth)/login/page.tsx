"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

import { loginAction } from "./actions"

/**
 * The only unauthenticated surface, and the first thing this app shows on a phone.
 *
 * It was a bare `Card` with a title and two fields — correct, and the one screen carrying
 * none of the identity the rest of the app is careful about. The wordmark is the same
 * `font-display` treatment the sidebar uses, over the same warm ground, with the terracotta
 * accent that marks the date on the dashboard.
 *
 * No Card any more: a bordered box floating on an empty viewport is chrome around nothing.
 * The form is the page.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined)

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      {/* The same top-down primary wash the dashboard opens with, so the first screen and
          the one behind it belong to each other. */}
      <div
        aria-hidden
        className="from-primary/[0.07] pointer-events-none fixed inset-x-0 top-0 h-72 bg-gradient-to-b to-transparent"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
            Your day, in one place
          </p>
          <h1 className="font-display mt-2 text-5xl font-semibold tracking-tight">
            Winnow
          </h1>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {state?.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
          {/* `aria-busy`, never `disabled` — this was the last file in the app still
              disabling a submit button while its action was in flight. A form whose submit
              is disabled performs no implicit submission, so Enter is simply dead for that
              window. It matters least here of anywhere (nobody submits a login twice in
              300ms), which is exactly why it survived; the house rule is worth more than the
              exception. The spinner is the same `size-4` box as no icon at all, so nothing
              shifts under a thumb. */}
          <Button type="submit" aria-busy={pending} className="mt-2">
            {pending ? <Spinner className="size-4" /> : null}
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  )
}
