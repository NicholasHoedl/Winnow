/**
 * React Hook Form `register` options for a numeric input where an empty value
 * means 0 (rather than NaN, which `valueAsNumber` produces and which then trips
 * a "must be a number" validation error on a cleared field).
 */
export const numberField = {
  setValueAs: (value: string) => (value === "" ? 0 : Number(value)),
}

/**
 * The same, for a field where empty means **unknown** rather than zero — so it maps to
 * null and the column stays NULL.
 *
 * The distinction is load-bearing for micronutrients: "0 g fiber" is a measurement,
 * "no fiber figure" is the absence of one, and collapsing the second into the first
 * makes a day's total look precise when most of its entries contributed nothing.
 */
export const optionalNumberField = {
  // Typed `unknown`, not `string`, because RHF calls setValueAs with the CURRENT form
  // value during registration — not only with what the input holds. With a null default
  // (which is the whole point here) a `value.trim()` implementation throws on mount and
  // takes the dialog down. `numberField` above survives the same call only by accident,
  // since Number(null) is 0.
  setValueAs: (value: unknown) => {
    if (value == null) return null
    const text = String(value).trim()
    return text === "" ? null : Number(text)
  },
}
