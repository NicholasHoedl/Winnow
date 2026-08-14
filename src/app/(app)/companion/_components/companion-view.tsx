"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ClipboardPaste,
  Repeat,
  ScrollText,
  Sparkles,
  Target,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { ProposalRow } from "@/modules/companion/queries"
import {
  useProposal,
  type ActivePayload,
} from "@/modules/companion/use-proposal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ImportProposal,
  type CategoryOption,
} from "@/components/companion/import-proposal"
import { PlanProposal } from "@/components/companion/plan-proposal"
import { RefinementBox } from "@/components/companion/refinement-box"
import { RoutineProposal } from "@/components/companion/routine-proposal"
import { SummaryProposal } from "@/components/companion/summary-proposal"

export type GoalOption = {
  id: string
  title: string
  /** Needed by the renderer to judge proposed dates — see `getPlannableGoals`. */
  targetDate: string | null
}

/** "Jul 27 – Aug 2" from the two dates the review was built for. */
function weekLabel(createdAt: Date): string {
  return createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function CompanionView({
  goals,
  pending,
  categories,
  currency,
  today,
}: {
  goals: GoalOption[]
  pending: ProposalRow[]
  categories: CategoryOption[]
  currency: string
  today: string
}) {
  const router = useRouter()
  const [paste, setPaste] = React.useState("")
  const [goalId, setGoalId] = React.useState(goals[0]?.id ?? "")
  const [brief, setBrief] = React.useState("")

  /**
   * `onApplied` navigates because THIS page is not where the rows land.
   *
   * The point of a proposal is the rows it created, and seeing them in their real home is
   * also the fastest way to notice it reads worse than it looked. T13 removes the need:
   * once each job sits on the page of its own artifact, applying leaves you looking at
   * what you just made, and the callback goes away with this page.
   */
  const proposal = useProposal({
    pending,
    onApplied: (applied) => {
      if (applied.kind === "goal_plan") {
        toast.success("Plan added to your goal")
        router.push("/activity")
      } else if (applied.kind === "routine") {
        toast.success("Routine created")
        router.push("/activity/routines")
      } else {
        toast.success(
          `${applied.payload.rows.length} transaction${
            applied.payload.rows.length === 1 ? "" : "s"
          } added`,
        )
        router.push("/budget")
      }
    },
  })
  const { busy, active, payload, version } = proposal

  const goalFor = (id: string | null) => goals.find((g) => g.id === id) ?? null
  const goalTitleFor = (id: string | null) =>
    goalFor(id)?.title ?? "Unknown goal"

  /**
   * The request a refinement sends, per kind — everything but the instruction itself.
   *
   * Each kind re-sends its own inputs, because the route validates a whole request per
   * kind rather than a partial one — a plan still names its goal, a routine its brief, an
   * extraction its source text. A `switch` over the union rather than a ternary chain: the
   * chain that was here let `import` fall through and ask for a summary instead.
   *
   * Null means "cannot refine this right now" — see `RefinementBox`, which takes the null
   * and disables itself on it.
   */
  function refinementBody(
    current: ActivePayload,
  ): Record<string, unknown> | null {
    if (!active) return null
    const common = { proposalId: active.id }
    switch (current.kind) {
      case "goal_plan":
        return {
          kind: "goal_plan",
          goalId: active.targetId ?? goalId,
          ...common,
        }
      case "routine":
        return { kind: "routine", brief: current.payload.name, ...common }
      case "summary":
        return { kind: "summary", ...common }
      case "import": {
        const text = paste.trim()
        return text ? { kind: "import", text, ...common } : null
      }
    }
  }

  const stillPending = pending.filter((p) => p.id !== active?.id)

  return (
    // Height is pinned only where the side-by-side layout exists. On a phone the panes
    // stack, and a viewport-height container there fights the page's own scrolling and
    // hides content behind the bottom tab bar — the panes have to flow, not be boxed.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6 lg:h-svh">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Companion
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          It proposes; you decide. Nothing is created until you apply it.
        </p>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        {/* Left: the jobs, then a conversation about whatever is on the right. */}
        <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 lg:min-h-0">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="text-brand-accent size-4" />
              Plan a goal
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Break a goal into milestones and the tasks that reach them.
            </p>
          </div>

          {goals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Create a goal first — there is nothing to plan yet.
            </p>
          ) : (
            <div className="flex gap-2">
              <Select value={goalId} onValueChange={(v) => v && setGoalId(v)}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Goal">
                  <SelectValue>
                    {(value) => goalTitleFor(value as string)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() =>
                  void proposal.generate({ kind: "goal_plan", goalId })
                }
                disabled={busy || !goalId}
                aria-busy={busy}
              >
                <Target className="size-4" />
                {busy ? "Thinking…" : "Plan"}
              </Button>
            </div>
          )}

          <div className="border-t pt-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Repeat className="text-brand-accent size-4" />
              Build a routine
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              A set of tasks to spin up together — a morning routine, trip prep.
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = brief.trim()
                if (!trimmed) return
                void proposal.generate({ kind: "routine", brief: trimmed })
              }}
            >
              <Input
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="A morning routine before work…"
                aria-label="Routine brief"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !brief.trim()}
                aria-busy={busy}
              >
                Build
              </Button>
            </form>
          </div>

          <div className="border-t pt-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ScrollText className="text-brand-accent size-4" />
              Read my week
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              A short read of the figures already on{" "}
              <Link href="/review" className="underline underline-offset-4">
                the weekly review
              </Link>
              .
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void proposal.generate({ kind: "summary" })}
              disabled={busy}
              aria-busy={busy}
            >
              Summarise this week
            </Button>
          </div>

          <div className="border-t pt-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ClipboardPaste className="text-brand-accent size-4" />
              Read transactions
            </h2>
            {/* Said out loud, not buried: this is the only job that sends your own
                financial detail to the provider. Every other prompt sends titles,
                descriptions or already-summed figures. */}
            <p className="text-muted-foreground mt-1 text-xs">
              Paste a bank export or a statement. Unlike the other jobs, the
              text you paste is sent to the AI provider.
            </p>
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = paste.trim()
                if (!trimmed) return
                void proposal.generate({ kind: "import", text: trimmed })
              }}
            >
              <Textarea
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder={
                  "2026-07-14,TESCO,-42.10\n2026-07-15,SALARY,2400.00"
                }
                aria-label="Transactions to read"
                rows={3}
                className="font-mono text-xs"
              />
              <Button
                type="submit"
                variant="outline"
                className="self-start"
                disabled={busy || !paste.trim()}
                aria-busy={busy}
              >
                Read them
              </Button>
            </form>
          </div>

          {active && payload && (
            <RefinementBox
              kind={payload.kind}
              value={proposal.instruction}
              onChange={proposal.setInstruction}
              body={refinementBody(payload)}
              busy={busy}
              onRefine={(body) => void proposal.generate(body)}
            />
          )}
        </div>

        {/* Right: the proposal above, everything still awaiting a decision below. */}
        <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
          {/* One frame, a body per kind. The shared parts — header, manifest footer,
              Discard/Apply — live inside each body rather than in a wrapper, because the
              three differ enough in the middle that a generic wrapper would end up
              parameterised into unreadability. */}
          {active && payload?.kind === "goal_plan" ? (
            <PlanProposal
              key={version}
              payload={payload.payload}
              onChange={(next) =>
                proposal.setPayload({ kind: "goal_plan", payload: next })
              }
              goalTitle={goalTitleFor(active.targetId)}
              targetDate={goalFor(active.targetId)?.targetDate ?? null}
              today={today}
              pending={busy}
              onApply={(next) =>
                proposal.apply({ kind: "goal_plan", payload: next })
              }
              onDiscard={proposal.discard}
            />
          ) : active && payload?.kind === "routine" ? (
            <RoutineProposal
              key={version}
              payload={payload.payload}
              onChange={(next) =>
                proposal.setPayload({ kind: "routine", payload: next })
              }
              pending={busy}
              onApply={(next) =>
                proposal.apply({ kind: "routine", payload: next })
              }
              onDiscard={proposal.discard}
            />
          ) : active && payload?.kind === "import" ? (
            <ImportProposal
              key={version}
              payload={payload.payload}
              categories={categories}
              currency={currency}
              pending={busy}
              onApply={(next) =>
                proposal.apply({ kind: "import", payload: next })
              }
              onDiscard={proposal.discard}
            />
          ) : active && payload?.kind === "summary" ? (
            <SummaryProposal
              key={version}
              payload={payload.payload}
              weekLabel={weekLabel(new Date(active.createdAt))}
              pending={busy}
              onDone={proposal.done}
            />
          ) : (
            <div className="text-muted-foreground flex items-center justify-center rounded-xl border border-dashed p-10 text-center text-sm">
              Nothing proposed yet. Pick a job on the left.
            </div>
          )}

          <div className="bg-card rounded-xl border p-4">
            <h2 className="text-muted-foreground text-xs font-medium">
              Awaiting a decision
              <span className="ml-1.5 font-mono">{stillPending.length}</span>
            </h2>
            {stillPending.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                Nothing waiting.
              </p>
            ) : (
              <ul
                data-testid="pending-queue"
                className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto"
              >
                {stillPending.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => proposal.open(row)}
                      className={cn(
                        "hover:bg-muted w-full truncate rounded px-2 py-1 text-left text-sm",
                      )}
                    >
                      {goalTitleFor(row.targetId)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
