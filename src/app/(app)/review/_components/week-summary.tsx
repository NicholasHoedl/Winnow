"use client"

import { ScrollText } from "lucide-react"

import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import { SummaryProposal } from "@/components/companion/summary-proposal"
import { ToolPanel } from "@/components/companion/tool-panel"
import { Button } from "@/components/ui/button"
import { useDateLocale } from "@/components/preferences/preferences-provider"

/** "Jul 27" from the date a review was generated for. */
function weekLabel(createdAt: Date, locale: string): string {
  return createdAt.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * "Read my week", on the week it reads.
 *
 * **This fixes a real bug, not just a relocation.** `buildSummaryMessages` has always taken
 * a `weekOf`, and `/review` has always parsed `?week=` — but `/companion` had no idea which
 * week you were looking at, so it never sent one and every summary narrated the CURRENT
 * week. Step back three weeks, ask for a summary, and you got a confident paragraph about
 * this week's figures under last month's heading. Nothing failed; it was just wrong.
 *
 * Here the page knows its own anchor and passes it, so the narration is always of the week
 * on screen. That is the clearest single argument for the whole T13 premise: the tool was
 * missing context that the artifact's own page has for free.
 *
 * A client island inside a server component — `review-view.tsx` has no `"use client"` and
 * should keep it that way, since the rest of the page is read-only.
 */
export function WeekSummary({
  pending,
  weekStart,
  isCurrentWeek,
}: {
  /** Pending `summary` proposals only — the page filters by kind at the query. */
  pending: ProposalRow[]
  /** The Monday of the week on screen, which is what gets narrated. */
  weekStart: string
  isCurrentWeek: boolean
}) {
  const locale = useDateLocale()
  // No `onApplied`: a summary has nothing to create, so there is nowhere to go.
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

  return (
    <div className="flex flex-col gap-4">
      <ToolPanel
        icon={ScrollText}
        title="Read my week"
        description={
          isCurrentWeek
            ? "A short read of the figures on this page, in words. Nothing is created — it is something to read and dismiss."
            : "A short read of the figures on this page, in words. It narrates the week you are looking at, not the current one."
        }
        refine={
          active && payload?.kind === "summary"
            ? {
                kind: "summary",
                value: proposal.instruction,
                onChange: proposal.setInstruction,
                // `weekOf` rides along on the refinement too. Without it a revision would
                // silently re-narrate the current week, which is the original bug wearing
                // a different hat.
                body: {
                  kind: "summary",
                  weekOf: weekStart,
                  proposalId: active.id,
                },
                busy,
                onRefine: (body) => void proposal.generate(body),
              }
            : null
        }
      >
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            void proposal.generate({ kind: "summary", weekOf: weekStart })
          }
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Reading…" : "Summarise this week"}
        </Button>
      </ToolPanel>

      {active && payload?.kind === "summary" && (
        <SummaryProposal
          key={proposal.version}
          payload={payload.payload}
          weekLabel={weekLabel(new Date(active.createdAt), locale)}
          pending={busy}
          onDone={proposal.done}
        />
      )}
    </div>
  )
}
