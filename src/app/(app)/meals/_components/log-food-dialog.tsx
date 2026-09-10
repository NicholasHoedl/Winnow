"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Barcode } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  logMeal,
  lookupBarcode,
  updateMealEntry,
} from "@/modules/meals/actions"
import type { ImportedFood, NutrientBasis } from "@/modules/meals/off-mapping"
import type { Food, MealEntry } from "@/modules/meals/queries"
import {
  defaultPortion,
  portionOptions,
  scaleReferenceFood,
  type ReferenceFood,
  type ReferencePortion,
} from "@/modules/meals/reference-foods"
import {
  MEAL_TYPES,
  type MealType,
  type QuickPickFood,
} from "@/modules/meals/service"
import { mealEntryInputSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { FoodSearch } from "./food-search"
import { NutritionExtraFields } from "./nutrition-extra-fields"

/**
 * Loaded only when the scanner is first opened. This is the outer half of the two-level
 * lazy load: without it the scanner component — and through it @zxing/browser — would be
 * part of the meals page bundle even though most sessions never scan anything.
 * `ssr: false` is legal here because this module is itself a client component.
 */
const BarcodeScannerDialog = dynamic(
  () => import("./barcode-scanner-dialog").then((m) => m.BarcodeScannerDialog),
  { ssr: false },
)

const NO_MEAL = "__none__"

// Date is supplied by the current day, not the form.
const formSchema = mealEntryInputSchema.omit({ date: true })

type LogFormValues = {
  foodId?: string
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number | null
  sugarG?: number | null
  satFatG?: number | null
  sodiumMg?: number | null
  barcode?: string | null
  servings: number
  mealType?: "" | MealType
  saveToLibrary?: boolean
}

// Micros default to null, not 0 — a blank field means "no figure", and the day's
// totals only count entries that actually carried one.
const EMPTY: LogFormValues = {
  foodId: "",
  name: "",
  servingLabel: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: null,
  sugarG: null,
  satFatG: null,
  sodiumMg: null,
  barcode: null,
  servings: 1,
  mealType: "",
  saveToLibrary: true,
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
}

export function LogFoodDialog({
  date,
  foods,
  quickPicks,
  entry,
  offEnabled,
  open,
  onOpenChange,
}: {
  date: string
  foods: Food[]
  /** The quick-pick ranking, so the search lists what you log most first. */
  quickPicks: QuickPickFood[]
  entry: MealEntry | null
  /** Whether the Open Food Facts integration is switched on for this install. */
  offEnabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!entry
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LogFormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: EMPTY,
  })

  // Set when a food-database result supplied per-100g figures rather than per-serving,
  // so the servings field can say what "1" now means.
  const [importedBasis, setImportedBasis] =
    React.useState<NutrientBasis | null>(null)
  // The reference food a pick came from, while it is the one in the form: it is what
  // offers the other portions. Cleared by any other pick, and by opening or closing.
  const [referenceFood, setReferenceFood] =
    React.useState<ReferenceFood | null>(null)
  const [portionIndex, setPortionIndex] = React.useState(0)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [lookingUp, startLookup] = React.useTransition()

  // Reset the pick state when the dialog opens/closes — during render, not in an effect
  // (which would be a setState-in-effect), mirroring the tasks dialog's scope reset.
  const wasOpenRef = React.useRef(open)
  if (open !== wasOpenRef.current) {
    wasOpenRef.current = open
    if (referenceFood !== null) setReferenceFood(null)
    if (importedBasis !== null) setImportedBasis(null)
  }

  React.useEffect(() => {
    if (!open) return
    if (entry) {
      reset({
        foodId: entry.foodId ?? "",
        name: entry.name,
        servingLabel: entry.servingLabel,
        calories: entry.calories,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
        fiberG: entry.fiberG,
        sugarG: entry.sugarG,
        satFatG: entry.satFatG,
        sodiumMg: entry.sodiumMg,
        servings: entry.servings,
        mealType: entry.mealType ?? "",
        saveToLibrary: false,
      })
    } else {
      reset(EMPTY)
    }
  }, [open, entry, reset])

  function onPickFood(food: Food) {
    setReferenceFood(null)
    setValue("foodId", food.id)
    setValue("name", food.name)
    setValue("servingLabel", food.servingLabel)
    setValue("calories", food.calories)
    setValue("proteinG", food.proteinG)
    setValue("carbsG", food.carbsG)
    setValue("fatG", food.fatG)
    // Carry the micros too, including their nulls — picking a food should reproduce it,
    // and leaving stale values from a previous pick would silently mislabel this entry.
    setValue("fiberG", food.fiberG)
    setValue("sugarG", food.sugarG)
    setValue("satFatG", food.satFatG)
    setValue("sodiumMg", food.sodiumMg)
    setValue("barcode", food.barcode)
    setValue("saveToLibrary", false)
    setImportedBasis(null)
  }

  /**
   * Fill the form from a food-database result. `saveToLibrary` stays ON: the point of
   * importing is that you don't have to type this product again, and the checkbox below
   * is still there to opt out.
   */
  function onPickImported(food: ImportedFood) {
    setReferenceFood(null)
    setValue("foodId", "")
    setValue("name", food.name)
    setValue("servingLabel", food.servingLabel)
    setValue("calories", food.calories)
    setValue("proteinG", food.proteinG)
    setValue("carbsG", food.carbsG)
    setValue("fatG", food.fatG)
    setValue("fiberG", food.fiberG)
    setValue("sugarG", food.sugarG)
    setValue("satFatG", food.satFatG)
    setValue("sodiumMg", food.sodiumMg)
    setValue("barcode", food.barcode)
    setValue("saveToLibrary", true)
    setImportedBasis(food.basis)
  }

  /**
   * Fill the form from a reference food at one of its portions. Per 100 g in the dataset,
   * scaled here, so the form holds figures for the portion named in the serving label and
   * "1 serving" means what it says. `saveToLibrary` stays ON, as for an import: the point
   * is not to look it up again.
   */
  function applyPortion(food: ReferenceFood, portion: ReferencePortion) {
    const scaled = scaleReferenceFood(food, portion)
    setValue("foodId", "")
    setValue("name", scaled.name)
    setValue("servingLabel", scaled.servingLabel)
    setValue("calories", scaled.calories)
    setValue("proteinG", scaled.proteinG)
    setValue("carbsG", scaled.carbsG)
    setValue("fatG", scaled.fatG)
    setValue("fiberG", scaled.fiberG)
    setValue("sugarG", scaled.sugarG)
    setValue("satFatG", scaled.satFatG)
    setValue("sodiumMg", scaled.sodiumMg)
    setValue("barcode", null)
    setValue("saveToLibrary", true)
    setImportedBasis(null)
  }

  function onPickReference(food: ReferenceFood) {
    const options = portionOptions(food)
    const usual = defaultPortion(food)
    const index = Math.max(
      0,
      options.findIndex(
        (portion) =>
          portion.label === usual.label && portion.grams === usual.grams,
      ),
    )
    setReferenceFood(food)
    setPortionIndex(index)
    applyPortion(food, options[index])
  }

  /** "Create '…'": hand entry, starting from the name that found nothing. */
  function onCreate(name: string) {
    setReferenceFood(null)
    setValue("name", name)
    setValue("foodId", "")
  }

  /**
   * A scanned (or typed) barcode. The scanner closes either way — a "not found" is an
   * answer, and leaving the camera running while a toast explains the miss is worse
   * than dropping the user back into the form to type it.
   */
  function handleDetected(barcode: string) {
    setScanOpen(false)
    startLookup(async () => {
      const result = await lookupBarcode(barcode)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (!result.food) {
        toast("No product found for that barcode", {
          description:
            "Fill in the fields below and it'll be saved for next time.",
        })
        // Keep the code, so saving builds a library entry the next scan will match.
        setValue("barcode", barcode)
        return
      }
      onPickImported(result.food)
      toast.success(`Found ${result.food.name}`)
    })
  }

  const onSubmit = handleSubmit(async (data) => {
    const payload = { ...data, date: isEdit ? entry.date : date }
    const result = isEdit
      ? await updateMealEntry(entry.id, payload)
      : await logMeal(payload)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof LogFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Entry updated" : "Logged")
    onOpenChange(false)
  })

  const foodId = watch("foodId")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "Log food"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this logged item."
              : "Add a food to the day's log."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {/* One bar for every way of finding a food (T31): the library, the bundled
                reference foods and Open Food Facts, in that order, with hand entry as
                the last row. It used to be a library picker here and a separate database
                panel below the scan button. */}
            {!isEdit && (
              <Field>
                <FieldLabel>Find a food</FieldLabel>
                <FoodSearch
                  foods={foods}
                  quickPicks={quickPicks}
                  offEnabled={offEnabled}
                  onPickFood={onPickFood}
                  onPickReference={onPickReference}
                  onPickImported={onPickImported}
                  onCreate={onCreate}
                />
              </Field>
            )}

            {!isEdit && offEnabled && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={lookingUp}
                onClick={() => setScanOpen(true)}
              >
                <Barcode className="size-4" />
                {lookingUp ? "Looking up…" : "Scan a barcode"}
              </Button>
            )}

            <Field>
              <FieldLabel htmlFor="l-name">Food</FieldLabel>
              <Input id="l-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="l-serv">Serving</FieldLabel>
                <Input
                  id="l-serv"
                  placeholder="e.g. 100 g"
                  {...register("servingLabel")}
                />
                {/* The database often only publishes per-100g figures. Say so, because
                    it changes what "1 serving" means for the amount you actually ate. */}
                {importedBasis === "100g" && (
                  <p className="text-muted-foreground text-xs">
                    Per 100 g — set servings to the amount you had (250 g →
                    2.5).
                  </p>
                )}
                {/* A reference food comes with USDA's household measures. Choosing one
                    rewrites the serving label and every figure for that portion. */}
                {referenceFood && (
                  <Select
                    value={String(portionIndex)}
                    onValueChange={(value) => {
                      if (value === null) return
                      const index = Number(value)
                      const portion = portionOptions(referenceFood)[index]
                      if (!portion) return
                      setPortionIndex(index)
                      applyPortion(referenceFood, portion)
                    }}
                  >
                    <SelectTrigger className="w-full" aria-label="Portion">
                      <SelectValue>
                        {(value) =>
                          portionOptions(referenceFood)[Number(value)]?.label ??
                          "Portion"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    {/* Wider than its trigger, which is half a dialog: USDA's measures
                        run long, and the weight is the part worth reading. */}
                    <SelectContent className="max-w-[calc(100vw-3rem)] min-w-72">
                      {portionOptions(referenceFood).map((portion, index) => (
                        <SelectItem
                          key={`${index}-${portion.label}`}
                          value={String(index)}
                        >
                          {portion.label === "100 g"
                            ? "100 g"
                            : `${portion.label} (${portion.grams} g)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FieldError errors={[errors.servingLabel]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-servings">Servings</FieldLabel>
                <Input
                  id="l-servings"
                  type="number"
                  step="any"
                  {...register("servings", numberField)}
                />
                <FieldError errors={[errors.servings]} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="l-cal">Calories</FieldLabel>
                <Input
                  id="l-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-pro">Protein (g)</FieldLabel>
                <Input
                  id="l-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-carb">Carbs (g)</FieldLabel>
                <Input
                  id="l-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-fat">Fat (g)</FieldLabel>
                <Input
                  id="l-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>

            <NutritionExtraFields
              register={register}
              errors={errors}
              idPrefix="l"
            />

            <Field>
              <FieldLabel>Meal</FieldLabel>
              <Controller
                control={control}
                name="mealType"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_MEAL}
                    onValueChange={(value) =>
                      field.onChange(
                        value && value !== NO_MEAL ? (value as MealType) : "",
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value) => MEAL_LABELS[value as MealType] ?? "No meal"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MEAL}>No meal</SelectItem>
                      {MEAL_TYPES.map((mealType) => (
                        <SelectItem key={mealType} value={mealType}>
                          {MEAL_LABELS[mealType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {!isEdit && !foodId && (
              <Controller
                control={control}
                name="saveToLibrary"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                    />
                    Save as a new food in my library
                  </label>
                )}
              />
            )}
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Mounted only once opened, so neither this component nor @zxing/browser is
          fetched for a session that never scans anything. */}
      {scanOpen && (
        <BarcodeScannerDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          onDetected={handleDetected}
        />
      )}
    </Dialog>
  )
}
