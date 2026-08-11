"use client"

import * as React from "react"
import { toast } from "sonner"

import { deleteEntry, logEntry } from "./actions"

/** Enough to log a habit and to name what was logged. Every card shape satisfies it. */
type Loggable = { id: string; title: string }

/**
 * Log one completion against a habit, with the undo that belongs to it.
 *
 * Three surfaces do this now — the strip above the task list, the habits page, and the
 * dashboard's practice card — and before this existed the first two held the same handler
 * twice, comment and all. It lives in the module rather than in `components/` because the
 * undo pairing is a fact about the ACTION, not about any page: it deletes exactly the row id
 * `logEntry` returned, because `habit_entries` has no unique constraint on
 * `(habit_id, on_date)` and "today's entry for this habit" could legitimately be one of
 * three (ADR-0014). That belongs beside `actions.ts`.
 *
 * `pendingId` rather than a boolean, which is the one behavioural change. A shared boolean
 * disabled EVERY habit while one write was in flight — invisible in a rail of three, and
 * plainly broken in a strip of eight, where it implies the others are blocked. ADR-0014's
 * mitigation is about double-logging the same habit, so the identity is the precise reading
 * of it.
 */
export function useLogHabit(): {
  /** The habit whose write is in flight, or null — so only the tapped control disables. */
  pendingId: string | null
  log: (habit: Loggable) => void
} {
  const [target, setTarget] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  // DERIVED, not cleared by an effect. The id is only meaningful while a write is in
  // flight, so gating it on the transition needs no second state update and no cascading
  // render — and it releases at the right moment for free.
  //
  // The right moment is when the TRANSITION ends, not when the action's promise resolves:
  // the action returns before the revalidated markup arrives, and re-enabling in that gap
  // is exactly the window a second tap needs. That is the double-write there is no unique
  // constraint to catch. `useTransition` stays pending across the re-render; the promise
  // does not. Undo opens a transition of its own, so the same chip stays disabled while its
  // entry is being removed — which is correct, not incidental.
  const pendingId = isPending ? target : null

  const log = React.useCallback((habit: Loggable) => {
    setTarget(habit.id)
    startTransition(async () => {
      const result = await logEntry(habit.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast(`Logged ${habit.title}`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undone = await deleteEntry(result.entryId)
              if (!undone.ok) toast.error(undone.error)
            }),
        },
      })
    })
  }, [])

  return { pendingId, log }
}
