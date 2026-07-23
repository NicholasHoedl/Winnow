import { z } from "zod"

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(80),
})
export type ProfileInput = z.infer<typeof profileSchema>

// Stronger than loginSchema (which allows min(1) for existing passwords).
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(200, "That's too long"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
