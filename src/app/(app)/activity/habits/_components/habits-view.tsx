"use client"

// A client component, unlike the read-only server page T7c had here. It needs a dialog, a
// menu, and the `+1` with its undo toast — the same shape `routines-view.tsx` uses.

import * as React from "react"
import Link from "next/link"
import {
  Archive,
  ArrowLeft,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { accentForKey } from "@/lib/colors"
import { dateRange } from "@/lib/date"
import type { GoalOption } from "@/modules/goals/queries"
import { archiveHabit, deleteHabit } from "@/modules/habits/actions"
import type {
  HabitCard as HabitCardData,
  HabitRow,
} from "@/modules/habits/queries"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import {
  heatmapLayout,
  periodLabel,
  periodPhrase,
} from "@/modules/habits/service"
import { Heatmap, type HeatmapCell } from "@/components/charts/heatmap"
import { Ring } from "@/components/charts/ring"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"

import { HabitDialog } from "./habit-dialog"

/** A wall-date formatted for a hover title. Parsed and formatted in UTC — the string has
 *  no instant behind it, so local parsing would shift it a day west of Greenwich. */
function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function HabitPanel({
  card,
  days,
  weekStartsOn,
  pending,
  onLog,
  onEdit,
  onArchive,
  onDelete,
}: {
  card: HabitCardData
  days: string[]
  weekStartsOn: number
  pending: boolean
  onLog: (card: HabitCardData) => void
  onEdit: (habit: HabitRow) => void
  onArchive: (habit: HabitRow) => void
  onDelete: (habit: HabitRow) => void
}) {
  // Renamed on the way out of `card`: destructuring it as `window` shadows the global one
  // inside this component, so a later edit reaching for `window.matchMedia` would get a
  // habit's adherence figures and no error worth reading.
  const { habit, now, streak, window: over } = card
  const accent = accentForKey(habit.id)

  const logged = new Map(card.days.map((d) => [d.date, d.count]))
  const grid = heatmapLayout(days, weekStartsOn)
  const cells: HeatmapCell[] = grid.cells.map((cell) => {
    const count = logged.get(cell.date) ?? 0
    return {
      key: cell.date,
      col: cell.col,
      row: cell.row,
      // Two tones only. Grading one session differently from three would invent a
      // precision the data does not have, and everything not-done stays one flat track so
      // a rest day does not read as a failure.
      className: count > 0 ? accent.fill : "fill-muted",
      title: `${formatDay(cell.date)}${count > 0 ? ` — ${count}` : ""}`,
    }
  })

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row">
      <div className="flex items-center gap-4 sm:flex-col sm:items-start">
        {/* A habit with no COMPLETED period has nothing to score, and every habit is in
            that state for its first one. "0%" there reads as failure; the truth is that
            the first week hasn't finished yet. */}
        <Ring
          percent={over.percent}
          label={over.elapsed === 0 ? "—" : `${over.percent}%`}
          ariaLabel={
            over.elapsed === 0
              ? `${habit.title}: no completed period yet`
              : `${habit.title}: ${over.met} of ${over.elapsed} periods met`
          }
          className={accent.stroke}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">{habit.title}</h3>
            <p className="text-muted-foreground text-xs">
              {periodLabel(habit)}
            </p>
          </div>

          {/* The action this page exists for. Disabled in flight because there is no
              unique constraint behind it — a double-click would write two rows. */}
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            aria-label={`Log ${habit.title}`}
            onClick={() => onLog(card)}
          >
            <Plus className="size-3.5" />
            Log
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${habit.title} actions`}
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(habit)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(habit)}>
                <Archive className="size-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(habit)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Progress
            value={now.percent}
            aria-hidden
            className="h-1.5 max-w-56 flex-1"
          />
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {now.done}/{now.target} {periodPhrase(habit.period)}
          </span>
        </div>

        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          Streak {streak.current} · best {streak.best} ·{" "}
          {over.elapsed === 0
            ? "nothing elapsed yet"
            : `${over.met}/${over.elapsed} met`}
        </p>

        <div className="mt-3">
          <Heatmap
            cells={cells}
            cols={grid.cols}
            ariaLabel={`${habit.title}: days logged over the last ${days.length} days`}
          />
        </div>
      </div>
    </div>
  )
}

export function HabitsView({
  cards,
  from,
  to,
  weekStartsOn,
  goals,
}: {
  cards: HabitCardData[]
  from: string
  to: string
  weekStartsOn: number
  goals: GoalOption[]
}) {
  const days = dateRange(from, to)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  // Kept when the dialog closes so its contents don't swap mid-exit-animation.
  const [editing, setEditing] = React.useState<HabitRow | null>(null)
  const [confirmTarget, setConfirmTarget] = React.useState<HabitRow | null>(
    null,
  )
  // Logging has its own transition, inside the hook. Sharing this one used to mean
  // archiving a habit greyed out every Log button on the page.
  const [, startTransition] = React.useTransition()
  const { pendingId, log } = useLogHabit()

  function openDialog(habit: HabitRow | null) {
    setEditing(habit)
    setDialogOpen(true)
  }

  function handleArchive(habit: HabitRow) {
    startTransition(async () => {
      const result = await archiveHabit(habit.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast(`${habit.title} archived`, {
        description: "Its history is kept.",
      })
    })
  }

  function handleDelete(habit: HabitRow) {
    startTransition(async () => {
      const result = await deleteHabit(habit.id)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Link
        href="/activity"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Activity
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Habits</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            How often you meant to, and how often you did — over the last{" "}
            {days.length} days.
          </p>
        </div>
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" />
          New habit
        </Button>
      </div>

      {cards.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Nothing yet. A habit is a rate you keep — three classes a week, ten
          new words a day. It makes no tasks; you log it when you do it.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <HabitPanel
              key={card.habit.id}
              card={card}
              days={days}
              weekStartsOn={weekStartsOn}
              pending={pendingId === card.habit.id}
              onLog={(target) => log(target.habit)}
              onEdit={openDialog}
              onArchive={handleArchive}
              onDelete={setConfirmTarget}
            />
          ))}
        </div>
      )}

      <HabitDialog
        habit={editing}
        goals={goals}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Delete this habit?"
        description={
          confirmTarget
            ? `"${confirmTarget.title}" and everything logged against it will be permanently deleted. Archive keeps the history instead.`
            : undefined
        }
        confirmLabel="Delete habit"
        onConfirm={() => {
          if (confirmTarget) handleDelete(confirmTarget)
        }}
      />
    </div>
  )
}
