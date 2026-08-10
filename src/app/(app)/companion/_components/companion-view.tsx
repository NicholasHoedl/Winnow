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
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { applyProposal, discardProposal } from "@/modules/companion/actions"
import type { ProposalRow } from "@/modules/companion/queries"
import {
  goalPlanPayloadSchema,
  importPayloadSchema,
  routinePayloadSchema,
  summaryPayloadSchema,
  type GoalPlanPayload,
  type ImportPayload,
  type RoutinePayload,
  type SummaryPayload,
} from "@/modules/companion/validation"
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

import { ImportProposal, type CategoryOption } from "./import-proposal"
import { PlanProposal } from "./plan-proposal"
import { RoutineProposal } from "./routine-proposal"
import { SummaryProposal } from "./summary-proposal"

export type GoalOption = {
  id: string
  title: string
  /** Needed by the renderer to judge proposed dates — see `getPlannableGoals`. */
  targetDate: string | null
}

/**
 * A payload the page is currently holding, tagged with which shape it is.
 *
 * The stored column is `jsonb` and the row's `kind` says how to read it, so the tag is
 * carried here rather than inferred from the shape — guessing between two object shapes
 * is how a renderer ends up silently drawing the wrong one.
 */
type ActivePayload =
  | { kind: "goal_plan"; payload: GoalPlanPayload }
  | { kind: "routine"; payload: RoutinePayload }
  | { kind: "summary"; payload: SummaryPayload }
  | { kind: "import"; payload: ImportPayload }

/** Stored payloads are `unknown` until parsed — the same gate the generator passed. */
function readPayload(proposal: ProposalRow): ActivePayload | null {
  if (proposal.kind === "goal_plan") {
    const parsed = goalPlanPayloadSchema.safeParse(proposal.payload)
    return parsed.success ? { kind: "goal_plan", payload: parsed.data } : null
  }
  if (proposal.kind === "routine") {
    const parsed = routinePayloadSchema.safeParse(proposal.payload)
    return parsed.success ? { kind: "routine", payload: parsed.data } : null
  }
  if (proposal.kind === "import") {
    const parsed = importPayloadSchema.safeParse(proposal.payload)
    return parsed.success ? { kind: "import", payload: parsed.data } : null
  }
  const parsed = summaryPayloadSchema.safeParse(proposal.payload)
  return parsed.success ? { kind: "summary", payload: parsed.data } : null
}

/**
 * Per-kind copy, as lookups rather than nested ternaries.
 *
 * The ternaries these replace stopped at `routine` and let `import` fall through to the
 * summary's wording — and the same fall-through in the request builder below meant
 * refining an extraction asked the server for a WEEKLY SUMMARY. A `Record` keyed on the
 * union fails to compile when a fifth kind arrives; a ternary chain silently picks the
 * last branch.
 */
const KIND_NOUN: Record<ActivePayload["kind"], string> = {
  goal_plan: "plan",
  routine: "routine",
  summary: "summary",
  import: "extraction",
}

const REFINE_PLACEHOLDER: Record<ActivePayload["kind"], string> = {
  goal_plan: "Make it three months — drop anything before March…",
  routine: "Add a walk — move the prep to two days before…",
  summary: "Be blunter — say more about the money…",
  import: "Drop the refunds — put the coffees under Food…",
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
  const [active, setActive] = React.useState<ProposalRow | null>(
    pending[0] ?? null,
  )
  const [payload, setPayload] = React.useState<ActivePayload | null>(() =>
    pending[0] ? readPayload(pending[0]) : null,
  )
  const [brief, setBrief] = React.useState("")
  const [instruction, setInstruction] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  /**
   * Bumped whenever a different plan arrives, and used as the renderer's `key`.
   *
   * The renderer holds which rows you switched off, and that state is meaningless against
   * a plan it was not chosen for — refine "make it shorter" and row 2 would arrive
   * pre-pruned for no reason the user could see. Remounting is the honest reset.
   */
  const [version, setVersion] = React.useState(0)

  const goalFor = (id: string | null) => goals.find((g) => g.id === id) ?? null
  const goalTitleFor = (id: string | null) =>
    goalFor(id)?.title ?? "Unknown goal"

  function open(proposal: ProposalRow) {
    const parsed = readPayload(proposal)
    if (!parsed) {
      toast.error("That proposal can't be read — discard it and try again.")
      return
    }
    setActive(proposal)
    setPayload(parsed)
    setInstruction("")
    setVersion((n) => n + 1)
  }

  /**
   * Generation goes through `fetch` to a route handler, not a Server Action.
   *
   * A Server Action would block the React transition it runs in for as long as the
   * provider takes — up to a minute. ADR-0012 records the reasoning; the visible
   * consequence is that this button can show its own pending state while the rest of the
   * page stays alive.
   */
  async function generate(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const response = await fetch("/companion/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as
        { ok: true; proposal: ProposalRow } | { ok: false; error: string }
      if (!data.ok) {
        // Typed failure from the provider, rendered here rather than thrown. Nothing was
        // created, and the manual path — /activity — is untouched.
        toast.error(data.error)
        return
      }
      open(data.proposal)
      router.refresh()
    } catch {
      toast.error("Couldn't reach the app's own server. Nothing was created.")
    } finally {
      setBusy(false)
    }
  }

  /**
   * A summary has nothing to create, so Done just clears it from the queue. Reusing
   * `discardProposal` rather than inventing a fourth status: "read and finished with" and
   * "rejected" are the same outcome for something that was only ever going to be read.
   */
  function onDone() {
    onDiscard()
    toast.success("Marked as read")
  }

  /**
   * The request a refinement sends, per kind — everything but the instruction itself.
   *
   * Each kind re-sends its own inputs, because the route validates a whole request per
   * kind rather than a partial one — a plan still names its goal, a routine its brief, an
   * extraction its source text. A `switch` over the union rather than a ternary chain: the
   * chain that was here let `import` fall through and ask for a summary instead.
   *
   * Null means "cannot refine this right now", which only happens for an extraction whose
   * source text has been cleared out of the box. The text is deliberately NOT stored on
   * the proposal — a pasted bank statement is not something to keep a second copy of.
   * Returning null rather than a boolean keeps that rule in ONE place: the render disables
   * the box on the same call that would have built the request.
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

  function onApply(finalized: Exclude<ActivePayload, { kind: "summary" }>) {
    if (!active) return
    setBusy(true)
    void applyProposal({ id: active.id, ...finalized })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        setActive(null)
        setPayload(null)
        // Straight to the result: the point of a proposal is the rows it created, and
        // seeing them in their real home is also the fastest way to notice it reads worse
        // than it looked.
        if (finalized.kind === "goal_plan") {
          toast.success("Plan added to your goal")
          router.push("/activity")
        } else if (finalized.kind === "routine") {
          toast.success("Routine created")
          router.push("/activity/routines")
        } else {
          toast.success(
            `${finalized.payload.rows.length} transaction${
              finalized.payload.rows.length === 1 ? "" : "s"
            } added`,
          )
          router.push("/budget")
        }
      })
      .finally(() => setBusy(false))
  }

  /**
   * Clears the proposal only once the write has landed.
   *
   * It used to null the local state first and fire the action unawaited, which looked
   * instant and lost the write to any navigation that outran it — the proposal was back
   * on the next page load. Same shape as the quick-add capture bug: optimistic UI in
   * front of an unawaited action. A single UPDATE is fast enough not to need the
   * optimism, and `busy` keeps the button honest while it runs.
   */
  function onDiscard() {
    if (!active) return
    const id = active.id
    setBusy(true)
    void discardProposal(id)
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        setActive(null)
        setPayload(null)
        router.refresh()
      })
      .finally(() => setBusy(false))
  }

  const stillPending = pending.filter((p) => p.id !== active?.id)
  // Null when the proposal on screen cannot be refined — see `refinementBody`. Computed
  // once here because the refine box asks the same question three times.
  const refineBody = payload ? refinementBody(payload) : null

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
                onClick={() => generate({ kind: "goal_plan", goalId })}
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
                void generate({ kind: "routine", brief: trimmed })
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
              onClick={() => generate({ kind: "summary" })}
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
                void generate({ kind: "import", text: trimmed })
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

          {/* Refinement is scoped to the proposal on the right — not an open chat. Each
              turn sends that plan plus this instruction, so there is no transcript to
              manage and nothing to infer about which job was meant. */}
          {active && payload && (
            <form
              className="flex flex-col gap-2 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = instruction.trim()
                if (!trimmed || !refineBody) return
                setInstruction("")
                void generate({ ...refineBody, instruction: trimmed })
              }}
            >
              <label
                htmlFor="refine"
                className="text-muted-foreground text-xs font-medium"
              >
                Change this {KIND_NOUN[payload.kind]}
              </label>
              <div className="flex gap-2">
                <Input
                  id="refine"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  // Off when there is nothing to build a request from — an extraction
                  // whose source text is gone, which is every extraction after a reload.
                  // Said here rather than on submit: a box that takes a sentence and then
                  // refuses it is worse than one that explains itself while empty.
                  disabled={!refineBody}
                  placeholder={
                    refineBody
                      ? REFINE_PLACEHOLDER[payload.kind]
                      : "Put the transactions back in the box above to change this"
                  }
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  aria-label="Revise the proposal"
                  aria-busy={busy}
                  disabled={!refineBody}
                >
                  <Wand2 className="size-4" />
                </Button>
              </div>
            </form>
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
                setPayload({ kind: "goal_plan", payload: next })
              }
              goalTitle={goalTitleFor(active.targetId)}
              targetDate={goalFor(active.targetId)?.targetDate ?? null}
              today={today}
              pending={busy}
              onApply={(next) => onApply({ kind: "goal_plan", payload: next })}
              onDiscard={onDiscard}
            />
          ) : active && payload?.kind === "routine" ? (
            <RoutineProposal
              key={version}
              payload={payload.payload}
              onChange={(next) =>
                setPayload({ kind: "routine", payload: next })
              }
              pending={busy}
              onApply={(next) => onApply({ kind: "routine", payload: next })}
              onDiscard={onDiscard}
            />
          ) : active && payload?.kind === "import" ? (
            <ImportProposal
              key={version}
              payload={payload.payload}
              categories={categories}
              currency={currency}
              pending={busy}
              onApply={(next) => onApply({ kind: "import", payload: next })}
              onDiscard={onDiscard}
            />
          ) : active && payload?.kind === "summary" ? (
            <SummaryProposal
              key={version}
              payload={payload.payload}
              weekLabel={weekLabel(new Date(active.createdAt))}
              pending={busy}
              onDone={onDone}
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
                {stillPending.map((proposal) => (
                  <li key={proposal.id}>
                    <button
                      type="button"
                      onClick={() => open(proposal)}
                      className={cn(
                        "hover:bg-muted w-full truncate rounded px-2 py-1 text-left text-sm",
                      )}
                    >
                      {goalTitleFor(proposal.targetId)}
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
