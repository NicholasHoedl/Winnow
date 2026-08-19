"use client"

// A client component, unlike the read-only server page T7c had here. It needs a dialog, a
// menu, and the `+1` with its undo toast — the same shape `routines-view.tsx` uses.

import * as React from "react"
import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
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
import {
  archiveHabit,
  deleteHabit,
  unarchiveHabit,
} from "@/modules/habits/actions"
import type {
  ArchivedHabit,
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
import { LogHabitButton } from "@/components/habits/log-habit-button"
import { Ring } from "@/components/charts/ring"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QuotaMeter } from "@/components/ui/quota-meter"

import { HabitDialog } from "./habit-dialog"
import { useDateLocale } from "@/components/preferences/preferences-provider"

/**
 * When a habit was retired, in the local zone.
 *
 * NOT `formatDay`, which is next to it and looks like it would fit: that one parses a
 * wall-date string in UTC precisely because such a string has no instant behind it.
 * `archivedAt` is a real timestamp, so it wants the opposite treatment — read it where
 * the user is, or a habit archived this evening reads as tomorrow.
 */
function formatArchivedAt(at: Date, locale: string): string {
  return at.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** A wall-date formatted for a hover title. Parsed and formatted in UTC — the string has
 *  no instant behind it, so local parsing would shift it a day west of Greenwich. */
function formatDay(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
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
  archiving,
  onDelete,
}: {
  card: HabitCardData
  days: string[]
  weekStartsOn: number
  pending: boolean
  onLog: (card: HabitCardData, amount?: number) => void
  onEdit: (habit: HabitRow) => void
  onArchive: (habit: HabitRow) => void
  /** This habit's archive is in flight. */
  archiving: boolean
  onDelete: (habit: HabitRow) => void
}) {
  const locale = useDateLocale()
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
      title: `${formatDay(cell.date, locale)}${count > 0 ? ` — ${count}` : ""}`,
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
              unique constraint behind it — a double-click would write two rows. It asks
              for an amount when the habit has one to give; see `LogHabitButton`. */}
          <LogHabitButton
            title={habit.title}
            unit={now.unit}
            pending={pending}
            size="sm"
            onLog={(amount) => onLog(card, amount)}
          />

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
              <DropdownMenuItem
                onClick={() => onArchive(habit)}
                aria-busy={archiving}
              >
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

        {/* Segments, not a continuous fill. A smooth 66% reads as a quantity you are
            partway through accumulating; two boxes of three reads as what it is — two logs
            made and one to go. */}
        <QuotaMeter
          className="mt-2 max-w-72"
          name={habit.title}
          done={now.done}
          target={now.target}
          unit={now.unit}
          measured={now.measured}
          caption={periodPhrase(habit.period)}
        />

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
  archived,
}: {
  cards: HabitCardData[]
  from: string
  to: string
  weekStartsOn: number
  goals: GoalOption[]
  /** Retired habits, so archiving is something you can undo — see `getArchivedHabits`. */
  archived: ArchivedHabit[]
}) {
  const locale = useDateLocale()
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
  const [showArchived, setShowArchived] = React.useState(false)
  // Per-id, for the reason `useLogHabit` tracks logging per-id: a boolean would disable
  // every Unarchive button while one row's write is in flight.
  const [restoringId, setRestoringId] = React.useState<string | null>(null)
  // The other half of the pair. Archiving had no feedback at all while unarchiving did,
  // which is the asymmetry rather than a considered difference.
  const [archivingId, setArchivingId] = React.useState<string | null>(null)

  function openDialog(habit: HabitRow | null) {
    setEditing(habit)
    setDialogOpen(true)
  }

  function handleArchive(habit: HabitRow) {
    setArchivingId(habit.id)
    startTransition(async () => {
      const result = await archiveHabit(habit.id)
      setArchivingId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // The description is a promise the app can now keep: archived habits are listed
      // below and can be brought back. Until this UI existed, archiving hid a habit with
      // no route back, and this sentence was false.
      toast(`${habit.title} archived`, {
        description: "Its history is kept, and you can restore it below.",
      })
    })
  }

  function handleUnarchive(habit: ArchivedHabit) {
    setRestoringId(habit.id)
    startTransition(async () => {
      const result = await unarchiveHabit(habit.id)
      setRestoringId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Not "restored to where it was" — `habitStreak` recomputes from the entries, which
      // were never touched, so it comes back with whatever the gap did to it (ADR-0009).
      toast(`${habit.title} is back`, {
        description: "Its streak is recalculated from what it recorded.",
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
              onLog={(target, amount) => log(target.habit, amount)}
              onEdit={openDialog}
              onArchive={handleArchive}
              archiving={archivingId === card.habit.id}
              onDelete={setConfirmTarget}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-8 border-t pt-4">
          <button
            type="button"
            onClick={() => setShowArchived((open) => !open)}
            className="text-muted-foreground hover:text-foreground text-sm"
            aria-expanded={showArchived}
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>

          {showArchived && (
            <ul className="mt-3 flex flex-col gap-2">
              {archived.map((habit) => (
                <li
                  key={habit.id}
                  // `data-rail`, on something nowhere near the rail, and belt-and-braces:
                  // `visibleCard` is `div.bg-card:not([data-rail])`, so an `li` is already
                  // excluded by the element name alone. The attribute is here so that
                  // exclusion does not DEPEND on the element name — swap this to a `div`
                  // some day and the negative assertions proving a habit creates no task
                  // would silently invert. To that selector the attribute has only ever
                  // meant "not a row in the task list"; the rail was just the only place
                  // that used to be true.
                  data-rail
                  data-testid="archived-habit"
                  className="bg-card flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {habit.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Archived {formatArchivedAt(habit.archivedAt, locale)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringId === habit.id}
                    onClick={() => handleUnarchive(habit)}
                  >
                    <ArchiveRestore className="size-4" />
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
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
