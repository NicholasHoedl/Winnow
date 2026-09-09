"use client"

import type { EventOption } from "@/modules/calendar/queries"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { GoalForm } from "./goal-form"

/**
 * "New goal". Create only: editing a goal that exists happens in its editor, where its
 * milestones, practice and tasks are too (ADR-0021). This used to take a `goal` and switch
 * between "Add goal" and "Edit goal"; the form itself is `GoalForm`, shared with the editor,
 * so the two paths cannot drift.
 */
export function GoalDialog({
  events,
  open,
  onOpenChange,
}: {
  /** Every event, for the target-date link. Already fetched by the (app) layout. */
  events: EventOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add goal</DialogTitle>
          <DialogDescription>
            A long-term goal, tracked by the milestones you add to it.
          </DialogDescription>
        </DialogHeader>
        <GoalForm
          goal={null}
          events={events}
          open={open}
          submitLabel="Add"
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
