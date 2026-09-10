"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"

import {
  searchFoodDatabase,
  searchReferenceFoods,
} from "@/modules/meals/actions"
import type { ImportedFood } from "@/modules/meals/off-mapping"
import type { Food } from "@/modules/meals/queries"
import {
  defaultPortion,
  scaleReferenceFood,
  type ReferenceFood,
} from "@/modules/meals/reference-foods"
import { rankLibraryFoods, type QuickPickFood } from "@/modules/meals/service"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

/** Below this nothing is searched: one letter matches half of everything. */
const MIN_QUERY = 2
/** Packaged products wait for a third letter — that request spends someone else's rate limit. */
const MIN_PACKAGED_QUERY = 3
/** The reference index answers in milliseconds; the pause only coalesces keystrokes. */
const REFERENCE_DEBOUNCE_MS = 150
/** Long enough that a pause in typing is over before Open Food Facts is asked. */
const PACKAGED_DEBOUNCE_MS = 400
const LIBRARY_SHOWN = 5

/**
 * A result's two lines: the name, and under it the figures for its serving. Two lines
 * rather than name-left figures-right, because a USDA portion label can run to
 * "0.5 breast, bone removed (yield from 1 lb ready-to-cook chicken)" and a right-aligned
 * figure that cannot shrink crushed the name to nothing on a phone.
 */
function ItemBody({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{name}</span>
      <span className="text-muted-foreground truncate text-xs">{meta}</span>
    </span>
  )
}

/**
 * One search bar for every way of finding a food (T31, ADR-0025).
 *
 * Results arrive in three groups, in the order they are worth reading: your own library
 * (instant, ranked by what you log), the bundled reference foods (a Server Action over an
 * in-memory index — milliseconds), and packaged products from Open Food Facts (a network
 * round trip, so it comes last, waits for a longer pause, and never blocks the others). A
 * "Create" row closes the list so hand entry is always one keystroke away.
 *
 * **Reads only.** Picking a result fills the form around this component; the form's own
 * submit is what writes a row (ADR-0005's rule, kept for all three groups).
 *
 * Enter selects the highlighted row and does not submit the surrounding form — cmdk
 * handles the key — which `meals-capture.spec.ts` pins.
 */
export function FoodSearch({
  foods = [],
  quickPicks = [],
  offEnabled,
  onPickFood,
  onPickReference,
  onPickImported,
  onCreate,
}: {
  /** The library to search. The food manager passes none — it IS the library. */
  foods?: Food[]
  /** The quick-pick ranking, so the library group lists what you log most first. */
  quickPicks?: QuickPickFood[]
  /** Whether Open Food Facts is switched on for this install. */
  offEnabled: boolean
  onPickFood?: (food: Food) => void
  onPickReference: (food: ReferenceFood) => void
  onPickImported: (food: ImportedFood) => void
  /** Offered as the last row when given: "Create '…'", for a food nothing lists. */
  onCreate?: (name: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [reference, setReference] = React.useState<ReferenceFood[]>([])
  const [packaged, setPackaged] = React.useState<ImportedFood[]>([])
  const [packagedError, setPackagedError] = React.useState<string | null>(null)
  const [referencePending, startReference] = React.useTransition()
  const [packagedPending, startPackaged] = React.useTransition()

  const q = query.trim()

  // Every state write happens inside the timeout, never synchronously in the effect — a
  // synchronous setState here would cascade a render (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (q.length < MIN_QUERY) {
        setReference([])
        return
      }
      startReference(async () => {
        const result = await searchReferenceFoods(q)
        setReference(result.foods)
      })
    }, REFERENCE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q])

  React.useEffect(() => {
    if (!offEnabled) return
    const timer = setTimeout(() => {
      if (q.length < MIN_PACKAGED_QUERY) {
        setPackaged([])
        setPackagedError(null)
        return
      }
      startPackaged(async () => {
        const result = await searchFoodDatabase(q)
        if (result.ok) {
          setPackaged(result.foods)
          setPackagedError(null)
        } else {
          // The reason, in place, under the groups that did answer — an unreachable
          // database must never stand between the user and logging a meal.
          setPackaged([])
          setPackagedError(result.error)
        }
      })
    }, PACKAGED_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, offEnabled])

  const library = rankLibraryFoods(
    foods,
    quickPicks.map((pick) => pick.foodId),
    q,
    LIBRARY_SHOWN,
  )
  const showReference = q.length >= MIN_QUERY
  const showPackaged = offEnabled && q.length >= MIN_PACKAGED_QUERY
  const searchingReference = referencePending && reference.length === 0
  const searchingPackaged = packagedPending && packaged.length === 0

  function pick(action: () => void) {
    action()
    setQuery("")
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search foods…"
          aria-label="Search foods"
        />
        <CommandList className="max-h-72">
          {q.length < MIN_QUERY && (
            <p className="text-muted-foreground p-3 text-xs">
              Type to search your foods, the reference foods and packaged
              products.
            </p>
          )}

          {library.length > 0 && (
            <CommandGroup heading="Your library">
              {library.map((food) => (
                <CommandItem
                  key={`lib-${food.id}`}
                  value={`lib-${food.id}`}
                  onSelect={() => pick(() => onPickFood?.(food))}
                >
                  <ItemBody
                    name={food.name}
                    meta={`${Math.round(food.calories)} kcal · ${food.servingLabel}`}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showReference && (reference.length > 0 || searchingReference) && (
            <CommandGroup heading="Reference foods">
              {searchingReference ? (
                <p className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  Searching…
                </p>
              ) : (
                reference.map((food) => {
                  // Shown for its usual portion, which is what picking it fills in;
                  // the form offers the rest.
                  const usual = scaleReferenceFood(food, defaultPortion(food))
                  return (
                    <CommandItem
                      key={`ref-${food.id}`}
                      value={`ref-${food.id}`}
                      onSelect={() => pick(() => onPickReference(food))}
                    >
                      <ItemBody
                        name={food.name}
                        meta={`${Math.round(usual.calories)} kcal · ${usual.servingLabel}`}
                      />
                    </CommandItem>
                  )
                })
              )}
            </CommandGroup>
          )}

          {showPackaged && (
            <CommandGroup heading="Packaged products">
              {packagedError ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  {packagedError}
                </p>
              ) : searchingPackaged ? (
                <p className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  Searching…
                </p>
              ) : packaged.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  No products found.
                </p>
              ) : (
                packaged.map((food) => (
                  <CommandItem
                    key={`off-${food.barcode}-${food.name}`}
                    value={`off-${food.barcode}-${food.name}`}
                    onSelect={() => pick(() => onPickImported(food))}
                  >
                    <ItemBody
                      name={food.name}
                      meta={`${Math.round(food.calories)} kcal · ${food.servingLabel}`}
                    />
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          )}

          {onCreate && q.length > 0 && (
            <CommandGroup>
              <CommandItem
                value="__create__"
                onSelect={() => pick(() => onCreate(q))}
              >
                <Plus className="size-4" />
                Create “{q}”
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      {/* USDA asks to be named as the source of its data; Open Food Facts is crowd-sourced
          and often wrong, which is why every pick lands in an editable form. */}
      <p className="text-muted-foreground text-xs">
        Reference foods are from USDA FoodData Central
        {offEnabled ? "; packaged products from Open Food Facts" : ""}. Check
        the figures before saving.
      </p>
    </div>
  )
}
