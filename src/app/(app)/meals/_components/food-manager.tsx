"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createFood, deleteFood, restoreFood } from "@/modules/meals/actions"
import type { Food } from "@/modules/meals/queries"
import { foodInputSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type FoodFormValues = {
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

const EMPTY: FoodFormValues = {
  name: "",
  servingLabel: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
}

export function FoodManager({
  foods,
  open,
  onOpenChange,
}: {
  foods: Food[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FoodFormValues>({
    resolver: standardSchemaResolver(foodInputSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = handleSubmit(async (data) => {
    const result = await createFood(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof FoodFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Food added")
    reset(EMPTY)
  })

  // A deleted food is re-insertable, so offer undo rather than a confirm prompt.
  // (Past meal entries keep their macro snapshot regardless — only the reusable
  // library row is affected.)
  function remove(food: Food) {
    startTransition(async () => {
      const result = await deleteFood(food.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.food ?? food
      toast("Food deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreFood(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Food library</DialogTitle>
          <DialogDescription>
            Reusable foods with their per-serving macros.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field className="col-span-2">
                <FieldLabel htmlFor="f-name">Name</FieldLabel>
                <Input id="f-name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field className="col-span-2">
                <FieldLabel htmlFor="f-serv">Serving</FieldLabel>
                <Input
                  id="f-serv"
                  placeholder="e.g. 100 g, 1 cup"
                  {...register("servingLabel")}
                />
                <FieldError errors={[errors.servingLabel]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-cal">Calories</FieldLabel>
                <Input
                  id="f-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-pro">Protein (g)</FieldLabel>
                <Input
                  id="f-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-carb">Carbs (g)</FieldLabel>
                <Input
                  id="f-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-fat">Fat (g)</FieldLabel>
                <Input
                  id="f-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              Add food
            </Button>
          </FieldGroup>
        </form>

        <div className="mt-2 max-h-56 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {foods.length === 0 ? (
              <li className="text-muted-foreground text-sm">No foods yet.</li>
            ) : (
              foods.map((food) => (
                <li
                  key={food.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{food.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {food.servingLabel} · {Math.round(food.calories)} kcal
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${food.name}`}
                    disabled={pending}
                    onClick={() => remove(food)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
