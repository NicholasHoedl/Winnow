"use server"

import { AuthError } from "next-auth"

import { signIn } from "@/lib/auth"

export type LoginState = { error?: string } | undefined

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    })
    return undefined
  } catch (error) {
    // signIn throws a redirect on success — let that propagate.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." }
    }
    throw error
  }
}
