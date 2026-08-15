"use client"

import * as React from "react"
import { Repeat } from "lucide-react"

import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import { RoutineProposal } from "@/components/companion/routine-proposal"
import { ToolPanel } from "@/components/companion/tool-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * "Build a routine", on the routines page.
 *
 * **The T13 plan said `/activity` and this is `/activity/routines`**, which is a deliberate
 * reading rather than a slip. The tranche's whole premise is that a tool belongs on the page
 * of the artifact it produces; a routine's artifact is a ROUTINE, and routines are listed,
 * created, edited and run here. `/activity` is the task list — putting the builder there
 * would reproduce the exact problem T13 exists to fix, one page over.
 *
 * `revalidateProposal`'s map in `companion/actions.ts` points `routine` here for the same
 * reason. Running a routine creates tasks and so touches `/activity`, but APPLYING a
 * proposal creates the routine itself, and that is what has to re-read.
 */
export function RoutineTool({ pending }: { pending: ProposalRow[] }) {
  const [brief, setBrief] = React.useState("")
  // No `onApplied`: this IS the page the routine lands on, so the hook's default — refresh
  // in place — leaves it in the list below.
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

  return (
    <div className="flex flex-col gap-4">
      <ToolPanel
        icon={Repeat}
        title="Build a routine"
        description="Describe a set of tasks you spin up together — a morning routine, trip prep — and it proposes the steps and when each is due. It proposes; you decide."
        refine={
          active && payload?.kind === "routine"
            ? {
                kind: "routine",
                value: proposal.instruction,
                onChange: proposal.setInstruction,
                // The brief is re-sent from the PAYLOAD's name, not the input box: the box
                // may have been cleared or retyped since, and the route validates a whole
                // request per kind rather than a partial one.
                body: {
                  kind: "routine",
                  brief: payload.payload.name,
                  proposalId: active.id,
                },
                busy,
                onRefine: (body) => void proposal.generate(body),
              }
            : null
        }
      >
        <form
          className="flex gap-2"
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
            {busy ? "Thinking…" : "Build"}
          </Button>
        </form>
      </ToolPanel>

      {active && payload?.kind === "routine" && (
        <RoutineProposal
          key={proposal.version}
          payload={payload.payload}
          onChange={(next) =>
            proposal.setPayload({ kind: "routine", payload: next })
          }
          pending={busy}
          onApply={(next) => proposal.apply({ kind: "routine", payload: next })}
          onDiscard={proposal.discard}
        />
      )}
    </div>
  )
}
