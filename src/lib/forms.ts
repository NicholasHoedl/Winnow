/**
 * React Hook Form `register` options for a numeric input where an empty value
 * means 0 (rather than NaN, which `valueAsNumber` produces and which then trips
 * a "must be a number" validation error on a cleared field).
 */
export const numberField = {
  setValueAs: (value: string) => (value === "" ? 0 : Number(value)),
}
