"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  addSubtask,
  deleteSubtask,
  toggleSubtask,
} from "@/modules/todos/actions"
import type { Subtask } from "@/modules/todos/queries"
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
  subtasks: Subtask[]
}) {
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok && result.error) toast.error(result.error)
    })
  }

  function add() {
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle("")
    run(() => addSubtask(taskId, { title: trimmed }))
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
            className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
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
