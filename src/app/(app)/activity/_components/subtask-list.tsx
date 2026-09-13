"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { restoreIfEmpty, tryWrite } from "@/lib/forms"
import {
  addSubtask,
  deleteSubtask,
  toggleSubtask,
} from "@/modules/todos/actions"
import type { ActivitySubtask } from "@/modules/todos/queries"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

/**
 * A task's checklist.
 *
 * Deliberately the same shape as the milestone list on a goal card
 * (`goals-view.tsx`): a checkbox, a title that strikes through when done, and a per-row
 * delete. One level only — `tasks` stays a table every other module can join to rather
 * than a tree.
 *
 * No undo on delete, matching milestones: a subtask is one line of text, and the confirm
 * or toast would cost more than retyping it.
 */
export function SubtaskList({
  taskId,
  subtasks,
}: {
  taskId: string
  subtasks: ActivitySubtask[]
}) {
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      // `tryWrite`, because a bare `await` inside a transition has no catch: with the
      // network down a Server Action's fetch REJECTS, the rejection escapes, and React
      // hands the whole route to its error boundary — taking the open task dialog with it.
      const result = await tryWrite(action)
      if (result && !result.ok && result.error) toast.error(result.error)
    })
  }

  function add() {
    const trimmed = title.trim()
    if (!trimmed) return
    // Cleared synchronously, so a second Enter has nothing left to resubmit — and so the
    // failure path below has to put it back. The four capture bars' pattern; until T45 this
    // box did the clearing without the restoring, and a dropped connection simply ate what
    // had been typed.
    setTitle("")
    startTransition(async () => {
      const result = await tryWrite(() =>
        addSubtask(taskId, { title: trimmed }),
      )
      if (!result) {
        setTitle(restoreIfEmpty(trimmed))
        return
      }
      if (!result.ok && result.error) {
        toast.error(result.error)
        setTitle(restoreIfEmpty(trimmed))
      }
    })
  }

  return (
    <div className="mt-2 flex flex-col gap-1 border-t pt-2">
      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={subtask.done}
            onCheckedChange={(checked) =>
              run(() => toggleSubtask(subtask.id, checked === true))
            }
            aria-label={
              subtask.done
                ? `Mark ${subtask.title} as not done`
                : `Mark ${subtask.title} as done`
            }
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              subtask.done && "text-muted-foreground line-through",
            )}
          >
            {subtask.title}
          </span>
          <button
            type="button"
            disabled={pending}
            aria-label={`Delete ${subtask.title}`}
            onClick={() => run(() => deleteSubtask(subtask.id))}
            // `p-1.5 -my-1.5`: 14px of icon is the smallest target in the app, well under
            // the 24px floor. The padding takes the box to 26 and the negative margin is
            // VERTICAL ONLY — a negative margin on the right would push the border box
            // past the row's own edge, which is what the layout sweep calls a spill (see
            // the note on the fold chevron in `dashboard-card.tsx`). So the row keeps its
            // height and the icon moves 6px in from the edge it used to sit on (T40).
            className="text-muted-foreground hover:text-destructive -my-1.5 shrink-0 p-1.5 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add()
          }
        }}
        placeholder="Add a subtask"
        aria-label="Add a subtask"
        className="h-7 text-sm"
      />
    </div>
  )
}
