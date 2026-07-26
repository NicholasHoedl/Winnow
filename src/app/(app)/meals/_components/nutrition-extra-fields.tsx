"use client"

import {
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
} from "react-hook-form"

import { optionalNumberField } from "@/lib/forms"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * The micronutrient slice of a form. Any form rendering {@link NutritionExtraFields}
 * must carry exactly these names — that's what the `T` constraint enforces and what
 * makes the two casts inside sound.
 */
export type MicroFormValues = {
  fiberG?: number | null
  sugarG?: number | null
  satFatG?: number | null
  sodiumMg?: number | null
}

const MICROS = [
  { name: "fiberG", label: "Fiber", unit: "g" },
  { name: "sugarG", label: "Sugar", unit: "g" },
  { name: "satFatG", label: "Sat. fat", unit: "g" },
  { name: "sodiumMg", label: "Sodium", unit: "mg" },
] as const

/**
 * Collapsed by default: these are genuinely optional, and four more inputs above the
 * fold would make logging a banana feel like filing a nutrition label.
 *
 * A native <details> rather than a component — it is keyboard-operable and announced
 * correctly with no JS and no new primitive in the registry.
 */
export function NutritionExtraFields<T extends FieldValues & MicroFormValues>({
  register,
  errors,
  idPrefix,
}: {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  /** Namespaces the DOM ids so both dialogs can be mounted at once. */
  idPrefix: string
}) {
  // RHF's types are invariant in the form type, so narrow once here rather than
  // scattering casts through the body (same shape as RecurrenceFields).
  const reg = register as unknown as UseFormRegister<MicroFormValues>
  const err = errors as FieldErrors<MicroFormValues>

  return (
    <details className="group rounded-lg border px-3 py-2">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium select-none">
        More nutrition (optional)
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {MICROS.map(({ name, label, unit }) => (
          <Field key={name}>
            <FieldLabel htmlFor={`${idPrefix}-${name}`}>
              {label} ({unit})
            </FieldLabel>
            <Input
              id={`${idPrefix}-${name}`}
              type="number"
              step="any"
              min="0"
              // Not "0" — an empty field means "no figure for this", which is stored
              // as NULL and kept out of the day's totals.
              placeholder="unknown"
              {...reg(name, optionalNumberField)}
            />
            <FieldError errors={[err[name]]} />
          </Field>
        ))}
      </div>
    </details>
  )
}
