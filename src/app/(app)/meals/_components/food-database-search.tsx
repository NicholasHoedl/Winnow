"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { searchFoodDatabase } from "@/modules/meals/actions"
import type { ImportedFood } from "@/modules/meals/off-mapping"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Field, FieldLabel } from "@/components/ui/field"

// Long enough that a keystroke pause is over before we spend someone else's rate limit,
// short enough that it still feels like typing.
const DEBOUNCE_MS = 350
// Matches MIN_QUERY_LENGTH on the server; checked here too so a one-character query
// never leaves the browser.
const MIN_QUERY = 2

/**
 * Search Open Food Facts and hand back a mapped food. **Reads only** — picking a result
 * fills a form, it does not write anything; the surrounding form's own submit is what
 * creates a row (ADR-0005).
 *
 * Renders nothing when the food database is disabled for this install, so an offline
 * deployment doesn't show a search box that can never succeed.
 */
export function FoodDatabaseSearch({
  enabled,
  onPick,
}: {
  enabled: boolean
  onPick: (food: ImportedFood) => void
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<ImportedFood[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startSearch] = React.useTransition()

  React.useEffect(() => {
    if (!enabled) return
    const q = query.trim()
    // Every state write happens inside the timeout, never synchronously in the effect —
    // a synchronous setState here would cascade a render (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      if (q.length < MIN_QUERY) {
        setResults([])
        setError(null)
        return
      }
      startSearch(async () => {
        const result = await searchFoodDatabase(q)
        if (result.ok) {
          setResults(result.foods)
          setError(null)
        } else {
          // Show the reason in place and keep the hand-entry fields below usable — an
          // unreachable food database must never block logging a meal.
          setResults([])
          setError(result.error)
        }
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, enabled])

  if (!enabled) return null

  const searching = pending && query.trim().length >= MIN_QUERY

  return (
    <Field>
      <FieldLabel>Search the food database</FieldLabel>
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search Open Food Facts…"
        />
        <CommandList className="max-h-52">
          {error ? (
            <p className="text-muted-foreground p-3 text-xs">{error}</p>
          ) : searching ? (
            <p className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
              <Loader2 className="size-3 animate-spin" />
              Searching…
            </p>
          ) : (
            <CommandEmpty>
              {query.trim().length < MIN_QUERY
                ? "Type at least two letters."
                : "No products found."}
            </CommandEmpty>
          )}
          {!error && results.length > 0 && (
            <CommandGroup>
              {results.map((food) => (
                <CommandItem
                  key={`${food.barcode}-${food.name}`}
                  value={`${food.barcode}-${food.name}`}
                  onSelect={() => {
                    onPick(food)
                    setQuery("")
                    setResults([])
                  }}
                >
                  <span className="truncate">{food.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {Math.round(food.calories)} kcal · {food.servingLabel}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      <p className="text-muted-foreground text-xs">
        Values are whatever the database has — check them before saving.
      </p>
    </Field>
  )
}
