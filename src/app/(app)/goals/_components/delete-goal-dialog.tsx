"use client"

import * as React from "react"

import type { PracticeOnDelete } from "@/modules/goals/validation"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * Deleting a goal, when the goal has a practice attached.
 *
 * Deliberately NOT `ConfirmDialog`, for the same reason `ConfirmWordDialog` is not: this one
 * needs a control, and `ConfirmDialog`'s only slot for anything is `description`, which
 * renders inside `AlertDialogDescription`. Putting radios in a description is both an
 * accessibility problem — the group loses its own label — and, since that element renders as
 * a paragraph, invalid markup.
 *
 * **The milestones are stated, not offered.** `milestones.goal_id` is NOT NULL, so a
 * milestone genuinely cannot outlive its goal; an option to keep them would need a nullable
 * column and somewhere to show goal-less milestones, and an option that silently does
 * nothing is worse than no option. The habits are the opposite case — `ON DELETE SET NULL`
 * has always kept them — so that is where the choice belongs.
 *
 * Native radios rather than a `Select`. Three mutually exclusive outcomes on a destructive
 * confirm should all be visible without a tap, and the base-ui `Select` cannot be driven in
 * jsdom, which would put this group beyond the reach of a component test.
 */
export function DeleteGoalDialog({
  open,
  onOpenChange,
  title,
  milestoneCount,
  habitCount,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  milestoneCount: number
  habitCount: number
  /** The confirm fires as the dialog closes, matching `ConfirmDialog`. */
  onConfirm: (practice: PracticeOnDelete) => void
}) {
  const [practice, setPractice] = React.useState<PracticeOnDelete>("leave")

  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`

  const options: { value: PracticeOnDelete; label: string; hint: string }[] = [
    {
      value: "leave",
      label: "Leave them",
      hint: "They stay on the habits page, no longer attached to a goal.",
    },
    {
      value: "archive",
      label: "Archive them",
      hint: "Keeps every entry you logged, and takes them off the page.",
    },
    {
      value: "delete",
      label: "Delete them",
      hint: "Removes the habits and every entry logged against them. Cannot be undone.",
    },
  ]

  return (
    <AlertDialog
      open={open}
      // Back to the safe default on the way out, so cancelling after choosing "delete"
      // does not leave that choice armed for the next goal. In the handler rather than an
      // effect on `open`: a synchronous setState inside an effect cascades a render and the
      // lint rules reject it outright — the same trap `habit-dialog.tsx` documents.
      onOpenChange={(next) => {
        if (!next) setPractice("leave")
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {milestoneCount > 0
              ? `This goal and its ${plural(milestoneCount, "milestone")} will be permanently deleted.`
              : "This goal will be permanently deleted."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {habitCount > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Its practice · {plural(habitCount, "habit")}
            </legend>
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="practice-on-delete"
                  value={option.value}
                  checked={practice === option.value}
                  onChange={() => setPractice(option.value)}
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  {option.label}
                  <span className="text-muted-foreground block text-xs">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          {/* The label stays "Delete goal" whatever the practice choice is. Three e2e specs
              find this button by that name, and more to the point it names what the button
              is FOR — the practice is a modifier on it, not a different action. */}
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => onConfirm(habitCount > 0 ? practice : "leave")}
          >
            Delete goal
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
