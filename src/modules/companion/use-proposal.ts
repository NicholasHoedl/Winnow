"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { applyProposal, discardProposal } from "./actions"
import type { ProposalRow } from "./queries"
import {
  goalPlanPayloadSchema,
  importPayloadSchema,
  routinePayloadSchema,
  summaryPayloadSchema,
  type GoalPlanPayload,
  type ImportPayload,
  type RoutinePayload,
  type SummaryPayload,
} from "./validation"

/**
 * A payload the page is currently holding, tagged with which shape it is.
 *
 * The stored column is `jsonb` and the row's `kind` says how to read it, so the tag is
 * carried here rather than inferred from the shape — guessing between two object shapes
 * is how a renderer ends up silently drawing the wrong one.
 */
export type ActivePayload =
  | { kind: "goal_plan"; payload: GoalPlanPayload }
  | { kind: "routine"; payload: RoutinePayload }
  | { kind: "summary"; payload: SummaryPayload }
  | { kind: "import"; payload: ImportPayload }

/** Everything a proposal can turn into rows — i.e. all of them but a summary. */
export type AppliablePayload = Exclude<ActivePayload, { kind: "summary" }>

/** Stored payloads are `unknown` until parsed — the same gate the generator passed. */
export function readPayload(proposal: ProposalRow): ActivePayload | null {
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

export type UseProposal = {
  /** A write or a generation is in flight. Every control reads this. */
  busy: boolean
  /** The proposal on screen, or null. */
  active: ProposalRow | null
  /** Its parsed payload — kept separately because the user edits it in place. */
  payload: ActivePayload | null
  /** The renderer's `key`. See where it is bumped below; this is not decoration. */
  version: number
  /** The refinement box's text. */
  instruction: string
  setInstruction: (value: string) => void
  /** Replace the payload in place, as the renderers do while you edit. */
  setPayload: (next: ActivePayload) => void
  /** Show a proposal, parsing it first. Refuses one it cannot read. */
  open: (proposal: ProposalRow) => void
  /** POST to the generator. The body is the caller's, because each kind sends its own. */
  generate: (body: Record<string, unknown>) => Promise<void>
  /** Turn the (possibly edited) payload into real rows. */
  apply: (finalized: AppliablePayload) => void
  /** Reject it. Also what Done does to a summary. */
  discard: () => void
  /** Mark a summary read — a discard with a kinder toast. */
  done: () => void
}

/**
 * Everything a page needs to run one AI job, minus the job itself.
 *
 * This was the state of `CompanionView`, which held all four jobs on one page. T13 moves
 * each job onto the page of the artifact it produces — a plan with goals, a routine with
 * activity, a narrated week with the review, an extraction with the budget — so four pages
 * now need this, and none of them needs the other three's.
 *
 * It lives in the module beside `actions.ts` rather than in `components/`, following
 * `use-log-habit.ts`: what it encapsulates is facts about the ACTIONS, not about any page.
 * `apply` re-sends the edited payload because the schema re-validates it, `discard` waits
 * for the write instead of clearing optimistically, and `generate` goes over `fetch`
 * because a Server Action would block the transition for a minute. All three are properties
 * of the server side, and all three were re-derived wrongly at least once before they were
 * written down here.
 *
 * What it deliberately does NOT hold: the job's own inputs (a goal id, a brief, pasted
 * text), the refinement request body, and where to go after applying. Those differ per
 * kind and per page, and pulling them in is how a shared hook becomes a switch statement
 * with a hook wrapped round it.
 */
export function useProposal({
  pending,
  onApplied,
}: {
  /** Pending proposals from the server. The first is opened on mount. */
  pending: ProposalRow[]
  /**
   * Runs after a successful apply, with what was applied.
   *
   * `/companion` uses it to navigate to the rows that were just created, because it is not
   * the page they live on. A page that IS their home passes nothing and simply refreshes:
   * the new milestones are already on screen.
   */
  onApplied?: (applied: AppliablePayload) => void
}): UseProposal {
  const router = useRouter()
  const [active, setActive] = React.useState<ProposalRow | null>(
    pending[0] ?? null,
  )
  const [payload, setPayload] = React.useState<ActivePayload | null>(() =>
    pending[0] ? readPayload(pending[0]) : null,
  )
  const [instruction, setInstruction] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  /**
   * Bumped whenever a different payload arrives, and used as the renderer's `key`.
   *
   * The renderer holds which rows you switched off, and that state is meaningless against
   * a payload it was not chosen for — refine "make it shorter" and row 2 would arrive
   * pre-pruned for no reason the user could see. Remounting is the honest reset.
   */
  const [version, setVersion] = React.useState(0)

  const open = React.useCallback((proposal: ProposalRow) => {
    const parsed = readPayload(proposal)
    if (!parsed) {
      toast.error("That proposal can't be read — discard it and try again.")
      return
    }
    setActive(proposal)
    setPayload(parsed)
    setInstruction("")
    setVersion((n) => n + 1)
  }, [])

  /**
   * Generation goes through `fetch` to a route handler, not a Server Action.
   *
   * A Server Action would block the React transition it runs in for as long as the
   * provider takes — up to a minute. ADR-0012 records the reasoning; the visible
   * consequence is that the button can show its own pending state while the rest of the
   * page stays alive.
   */
  const generate = React.useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      try {
        const response = await fetch("/api/companion/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = (await response.json()) as
          { ok: true; proposal: ProposalRow } | { ok: false; error: string }
        if (!data.ok) {
          // Typed failure from the provider, rendered here rather than thrown. Nothing was
          // created, and the manual path is untouched.
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
    },
    [open, router],
  )

  /**
   * Clears the proposal only once the write has landed.
   *
   * It used to null the local state first and fire the action unawaited, which looked
   * instant and lost the write to any navigation that outran it — the proposal was back
   * on the next page load. Same shape as the quick-add capture bug: optimistic UI in
   * front of an unawaited action. A single UPDATE is fast enough not to need the
   * optimism, and `busy` keeps the button honest while it runs.
   */
  const discard = React.useCallback(() => {
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
  }, [active, router])

  /**
   * A summary has nothing to create, so Done just clears it from the queue. Reusing
   * `discardProposal` rather than inventing a fourth status: "read and finished with" and
   * "rejected" are the same outcome for something that was only ever going to be read.
   */
  const done = React.useCallback(() => {
    discard()
    toast.success("Marked as read")
  }, [discard])

  const apply = React.useCallback(
    (finalized: AppliablePayload) => {
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
          if (onApplied) {
            onApplied(finalized)
          } else {
            // No navigation: the caller is already the page these rows live on, and the
            // action revalidated it. Still a refresh, because the server component has to
            // re-read to show them.
            router.refresh()
          }
        })
        .finally(() => setBusy(false))
    },
    [active, onApplied, router],
  )

  return {
    busy,
    active,
    payload,
    version,
    instruction,
    setInstruction,
    setPayload,
    open,
    generate,
    apply,
    discard,
    done,
  }
}
