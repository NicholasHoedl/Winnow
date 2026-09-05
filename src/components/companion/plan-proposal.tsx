"use client"

import * as React from "react"
import { AlertTriangle, Flag, ListTodo, Plus, Repeat } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  finalizePlan,
  planWarnings,
  proposedQuota,
  type Excluded,
  type PlanWarning,
} from "@/modules/companion/service"
import { PLAN_CAPS, type GoalPlanPayload } from "@/modules/companion/validation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * A title that is always editable but reads as text.
 *
 * No click-to-edit mode: a borderless input that reveals its edges on hover and focus.
 * Fifteen rows with a mode each is fifteen chances to be in the wrong one, and the whole
 * point of this surface is to fix two or three things quickly and move on.
 */
function EditableTitle({
  value,
  onChange,
  disabled,
  className,
  label,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  className?: string
  label: string
  /** Set on a row that was just added, so typing is the next thing you do. */
  autoFocus?: boolean
}) {
  return (
    <input
      value={value}
      aria-label={label}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "hover:bg-muted focus:bg-muted -mx-1 min-w-0 flex-1 truncate rounded px-1 outline-none",
        "focus:ring-ring focus:ring-1",
        disabled && "pointer-events-none line-through opacity-60",
        className,
      )}
    />
  )
}

function EditableDate({
  value,
  onChange,
  disabled,
  label,
  warning,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  label: string
  warning?: PlanWarning
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {warning && (
        <AlertTriangle
          className={cn(
            "size-3.5",
            warning.kind === "tight" ? "text-brand-accent" : "text-destructive",
          )}
          aria-hidden
        />
      )}
      <span className="sr-only">{warning?.message}</span>
      <input
        type="date"
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "hover:bg-muted focus:bg-muted focus:ring-ring rounded px-1 font-mono text-xs outline-none focus:ring-1",
          disabled && "pointer-events-none opacity-60",
          warning
            ? warning.kind === "tight"
              ? "text-brand-accent"
              : "text-destructive"
            : "text-muted-foreground",
        )}
      />
    </span>
  )
}

/**
 * The proposal renderer: a plan on a time spine.
 *
 * The spine is not decoration. Dates are what a model gets wrong most often, and a form
 * hides distribution completely — three milestones quietly bunched into one week look
 * identical to three spread evenly. On a timeline they don't.
 *
 * Excluded rows stay in place, struck and dimmed, rather than disappearing. Removing them
 * would reshuffle the list under the cursor mid-prune, which is the same reasoning that
 * keeps the linked-task list stable on a goal card.
 */
export function PlanProposal({
  payload,
  onChange,
  goalTitle,
  goal,
  today,
  existingCommitments,
  pending,
  onApply,
  onDiscard,
}: {
  payload: GoalPlanPayload
  onChange: (next: GoalPlanPayload) => void
  goalTitle: string
  /**
   * What the plan is judged against. Was a bare `targetDate` until the rate check needed
   * the numeric target too — and since the only thing this component ever did with the
   * date was hand it to `planWarnings`, one object beats four parallel props.
   */
  goal: {
    targetDate: string | null
    targetValue: number | null
    currentValue: number | null
    unit: string | null
  }
  today: string
  /**
   * Weekly commitments the account already keeps, across every goal.
   *
   * Passed in rather than measured here: this component is rendered from a page that has
   * already loaded the habits, and a second read from a client component would be a
   * round trip for a number somebody upstairs is holding.
   */
  existingCommitments: number
  pending: boolean
  onApply: (finalized: GoalPlanPayload) => void
  onDiscard: () => void
}) {
  const [excluded, setExcluded] = React.useState<{
    milestones: Set<number>
    habits: Set<number>
    setupTasks: Set<number>
  }>({ milestones: new Set(), habits: new Set(), setupTasks: new Set() })

  // Recomputed from the CURRENT payload, so fixing a bad date makes its warning vanish
  // as you type. The app judges these dates; the model is never asked to grade itself.
  // Destructured so the memo keys on VALUES. The caller builds `goal` inline, so a
  // dependency on the object itself would be a new reference every render and the memo
  // would never hit — a memo that always recomputes is worse than no memo, because it
  // reads as if the cost had been considered.
  const { targetDate, targetValue, currentValue, unit: goalUnit } = goal
  const warnings = React.useMemo(
    () =>
      planWarnings(
        payload,
        { targetDate, targetValue, currentValue, unit: goalUnit },
        today,
        existingCommitments,
      ),
    [
      payload,
      targetDate,
      targetValue,
      currentValue,
      goalUnit,
      today,
      existingCommitments,
    ],
  )
  const warningFor = (on: "milestone" | "setupTask", index: number) =>
    warnings.find((w) => w.on === on && w.index === index)
  // ALL of them, not the first. An empty plan produces both `no-habits` and `no-milestones`
  // and only ever showed one, which was a latent shortcoming before `rate-short` gave it a
  // third way to happen — a slow plan that also has no milestones would have hidden one.
  const planLevel = warnings.filter((w) => w.on === "plan")

  const final = finalizePlan(payload, excluded as Excluded)

  function toggle(on: "milestones" | "habits" | "setupTasks", index: number) {
    setExcluded((current) => {
      const next = new Set(current[on])
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { ...current, [on]: next }
    })
  }

  /**
   * The row to focus, if one was just added.
   *
   * `autoFocus` fires on MOUNT, which is exactly the semantics wanted here: a new row
   * focuses itself as it appears, and nothing refocuses when an unrelated re-render moves
   * through. That is why this is never cleared — clearing it would be a setState with no
   * reader, and the lint rules reject a synchronous one in an effect anyway.
   */
  const [justAdded, setJustAdded] = React.useState<{
    on: "milestones" | "habits"
    index: number
  } | null>(null)

  /**
   * Append, never insert.
   *
   * `excluded` is a set of INDEXES into these arrays, so a row inserted anywhere but the
   * end would silently repoint every exclusion after it — a checkbox you unticked on step
   * 3 would come back applying to step 4. That is the renumbering bug `finalizePlan`'s own
   * note describes, and appending is what makes it unreachable rather than merely unlikely.
   *
   * The new row starts UNNAMED and is therefore not counted by the "Creates N…" line and
   * not created by Apply, until you type something. `finalizePlan` drops unnamed rows for
   * that reason: an empty row you thought better of costs nothing and cannot fail an apply.
   */
  function addMilestone() {
    if (payload.milestones.length >= PLAN_CAPS.milestones) return
    // Dated after the last step rather than today: appending to a plan means "and then
    // this", and a new row dated in the middle of the spine reads as a mistake.
    const last = payload.milestones.at(-1)
    setJustAdded({ on: "milestones", index: payload.milestones.length })
    onChange({
      ...payload,
      milestones: [
        ...payload.milestones,
        { title: "", dueDate: last?.dueDate ?? today },
      ],
    })
  }

  function addHabit() {
    if (payload.habits.length >= PLAN_CAPS.habits) return
    setJustAdded({ on: "habits", index: payload.habits.length })
    onChange({
      ...payload,
      // Three a week, the same default the habit dialog uses, and a SESSION habit: a
      // measured one needs a unit, and the unit is the field this panel deliberately
      // refuses to edit — "words" to "pages" is a different practice, not a correction.
      habits: [
        ...payload.habits,
        {
          title: "",
          period: "week" as const,
          targetCount: 3,
          targetAmount: null,
          unit: null,
        },
      ],
    })
  }

  function editMilestone(
    index: number,
    patch: { title?: string; dueDate?: string },
  ) {
    onChange({
      ...payload,
      milestones: payload.milestones.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    })
  }

  function editHabit(
    index: number,
    patch: { title?: string; targetCount?: number; targetAmount?: number },
  ) {
    onChange({
      ...payload,
      habits: payload.habits.map((h, i) =>
        i === index ? { ...h, ...patch } : h,
      ),
    })
  }

  function editSetupTask(
    index: number,
    patch: { title?: string; dueDate?: string },
  ) {
    onChange({
      ...payload,
      setupTasks: payload.setupTasks.map((t, i) =>
        i === index ? { ...t, ...patch } : t,
      ),
    })
  }

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <p className="text-brand-accent text-xs font-medium">Proposed plan</p>
          <h2 className="truncate font-medium">{goalTitle}</h2>
        </div>
      </div>

      {/* Capped on a phone so the footer's Apply stays reachable without scrolling past a
          long plan; on desktop it fills whatever the pinned column gives it. */}
      <div className="max-h-[55svh] overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
        {/* A judgement about the plan as a whole rather than any one row. The app noticing
            "there is no practice here" is the same division as every other warning: the
            model proposes, the app checks. */}
        {planLevel.map((warning) => (
          <p
            key={warning.kind}
            className="text-brand-accent mb-4 flex items-start gap-1.5 text-xs"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {warning.message}
          </p>
        ))}

        <ol className="border-border ml-1.5 flex flex-col gap-5 border-l-2 pl-5">
          {payload.milestones.map((milestone, index) => {
            const off = excluded.milestones.has(index)
            const warning = warningFor("milestone", index)
            return (
              <li key={index} className="relative">
                <span
                  className={cn(
                    "border-card absolute top-1.5 -left-[27px] size-3 rounded-full border-2",
                    off
                      ? "bg-muted-foreground/40"
                      : warning && warning.kind !== "tight"
                        ? "bg-destructive"
                        : warning
                          ? "bg-brand-accent"
                          : "bg-primary",
                  )}
                />
                <div className="flex items-baseline gap-2 text-sm">
                  <Checkbox
                    checked={!off}
                    aria-label={`Include ${milestone.title}`}
                    onCheckedChange={() => toggle("milestones", index)}
                    className="shrink-0 self-center"
                  />
                  <Flag className="text-muted-foreground size-3.5 shrink-0 self-center" />
                  <EditableTitle
                    value={milestone.title}
                    disabled={off}
                    label={`Milestone ${index + 1} title`}
                    autoFocus={
                      justAdded?.on === "milestones" &&
                      justAdded.index === index
                    }
                    className="font-medium"
                    onChange={(title) => editMilestone(index, { title })}
                  />
                  <EditableDate
                    value={milestone.dueDate}
                    disabled={off}
                    warning={warning}
                    label={`Milestone ${index + 1} date`}
                    onChange={(dueDate) => editMilestone(index, { dueDate })}
                  />
                </div>
                {warning && !off && (
                  <p
                    className={cn(
                      "mt-1 ml-7 text-xs",
                      warning.kind === "tight"
                        ? "text-brand-accent"
                        : "text-destructive",
                    )}
                  >
                    {warning.message}
                  </p>
                )}
              </li>
            )
          })}
        </ol>

        {/* Aligned with the spine's text rather than its rule, so it reads as the next
            step in the list rather than a control bolted to the side of it. */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground mt-2 ml-[26px] h-7 px-1"
          onClick={addMilestone}
          disabled={
            pending || payload.milestones.length >= PLAN_CAPS.milestones
          }
        >
          <Plus className="size-3.5" />
          Add a milestone
        </Button>

        {/* Off the spine, deliberately. The spine exists to expose date DISTRIBUTION, and a
            habit has no date to distribute — putting it on a timeline would be inventing a
            position for something that recurs. */}
        {/* Rendered even with nothing in it, which it was not before. A plan with no
            practice is precisely when you want to add one — it is the case the `no-habits`
            warning is about — and a section that hides itself takes its Add button with
            it. */}
        <section className="mt-6">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            The practice
          </h3>
          {payload.habits.length === 0 && (
            <p className="text-muted-foreground mb-2 text-sm">
              Nothing proposed. A practice is something you repeat — three
              sessions a week — rather than a step you finish.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {payload.habits.map((habit, index) => {
              const off = excluded.habits.has(index)
              // The same reading `finalizePlan` will take. A habit the model half-stated
              // renders as the session habit it will become, rather than as an amount
              // with nothing to count.
              const quota = proposedQuota(habit)
              return (
                <li key={index} className="flex items-baseline gap-2 text-sm">
                  <Checkbox
                    checked={!off}
                    aria-label={`Include ${habit.title}`}
                    onCheckedChange={() => toggle("habits", index)}
                    className="shrink-0 self-center"
                  />
                  <Repeat className="text-muted-foreground size-3.5 shrink-0 self-center" />
                  <EditableTitle
                    value={habit.title}
                    disabled={off}
                    label={`Habit ${index + 1} title`}
                    autoFocus={
                      justAdded?.on === "habits" && justAdded.index === index
                    }
                    onChange={(title) => editHabit(index, { title })}
                  />
                  {/* The figure is editable and the period is not. "5 a week" wanting to
                        be "3 a week" is the correction people actually make; week → day is a
                        different habit rather than an edit to this one. The UNIT is fixed
                        for the same reason — "words" to "pages" is a different practice,
                        and it is the field the rate check compares against the goal. */}
                  <span
                    className={cn(
                      "text-muted-foreground flex shrink-0 items-baseline gap-1 text-xs tabular-nums",
                      off && "line-through opacity-50",
                    )}
                  >
                    {quota.measured ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={quota.amount ?? 0}
                          disabled={off}
                          aria-label={`Habit ${index + 1} ${quota.unit} per ${habit.period}`}
                          onChange={(event) =>
                            editHabit(index, {
                              targetAmount: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
                            })
                          }
                          className="hover:border-input focus:border-ring w-14 rounded border border-transparent bg-transparent px-1 text-right outline-none"
                        />
                        <span>
                          {quota.unit} a {habit.period}
                        </span>
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={habit.targetCount}
                          disabled={off}
                          aria-label={`Habit ${index + 1} times per ${habit.period}`}
                          onChange={(event) =>
                            editHabit(index, {
                              targetCount: Math.min(
                                100,
                                Math.max(1, Number(event.target.value) || 1),
                              ),
                            })
                          }
                          className="hover:border-input focus:border-ring w-10 rounded border border-transparent bg-transparent px-1 text-right outline-none"
                        />
                        <span>× a {habit.period}</span>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground mt-2 h-7 px-1"
            onClick={addHabit}
            disabled={pending || payload.habits.length >= PLAN_CAPS.habits}
          >
            <Plus className="size-3.5" />
            Add a practice
          </Button>
        </section>

        {payload.setupTasks.length > 0 && (
          <section className="mt-6">
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Before you start
            </h3>
            <ul className="flex flex-col gap-1.5">
              {payload.setupTasks.map((task, index) => {
                const off = excluded.setupTasks.has(index)
                const warning = warningFor("setupTask", index)
                return (
                  <li key={index} className="flex items-baseline gap-2 text-sm">
                    <Checkbox
                      checked={!off}
                      aria-label={`Include ${task.title}`}
                      onCheckedChange={() => toggle("setupTasks", index)}
                      className="shrink-0 self-center"
                    />
                    <ListTodo className="text-muted-foreground size-3.5 shrink-0 self-center" />
                    <EditableTitle
                      value={task.title}
                      disabled={off}
                      label={`Setup task ${index + 1} title`}
                      onChange={(title) => editSetupTask(index, { title })}
                    />
                    <EditableDate
                      value={task.dueDate}
                      disabled={off}
                      warning={warning}
                      label={`Setup task ${index + 1} date`}
                      onChange={(dueDate) => editSetupTask(index, { dueDate })}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      {/* The anti-surprise device: it counts what will actually be created, live, so
          Apply never does more than the number sitting next to it. */}
      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground text-xs">
          Creates{" "}
          <span className="text-foreground font-mono">
            {final.milestones.length}
          </span>{" "}
          milestone{final.milestones.length === 1 ? "" : "s"},{" "}
          <span className="text-foreground font-mono">
            {final.habits.length}
          </span>{" "}
          habit{final.habits.length === 1 ? "" : "s"} and{" "}
          <span className="text-foreground font-mono">
            {final.setupTasks.length}
          </span>{" "}
          task{final.setupTasks.length === 1 ? "" : "s"}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={pending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(final)}
            disabled={
              pending ||
              final.milestones.length +
                final.habits.length +
                final.setupTasks.length ===
                0
            }
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  )
}
