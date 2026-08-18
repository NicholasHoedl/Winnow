"use server"

import { redirect } from "next/navigation"
import { AuthError } from "next-auth"

import { signIn } from "@/lib/auth"
import { landingPageFor } from "@/modules/preferences/queries"

export type LoginState = { error?: string } | undefined

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
  try {
    /**
     * `redirect: false`, so this returns instead of throwing its own redirect — which is
     * what lets the destination depend on a preference.
     *
     * The lookup happens strictly AFTER `signIn` resolves, so it only ever runs for
     * credentials that were already correct; `landingPageFor` documents that it must not be
     * called anywhere that has not cleared that bar. It reads by email rather than through
     * `auth()` because the cookie is set during this same request and reading it back inside
     * the same server action is not something to depend on.
     */
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirect: false,
    })
    const destination = await landingPageFor(email)
    redirect(destination)
  } catch (error) {
    // Two different throws pass through here. `redirect()` throws NEXT_REDIRECT, which MUST
    // propagate — it is the success path. Only a genuine auth failure becomes a message.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." }
    }
    throw error
  }
}
