"use client"

import * as React from "react"
import { ClipboardPaste } from "lucide-react"

import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import {
  ImportProposal,
  type CategoryOption,
} from "@/components/companion/import-proposal"
import { ToolPanel } from "@/components/companion/tool-panel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * "Read transactions", on the ledger they land in.
 *
 * **The one job that sends your own financial detail to the provider**, and the UI says so
 * above the box rather than leaving it to be discovered. Every other prompt sends titles,
 * descriptions or already-summed figures; this sends the text you paste, because that is
 * the feature. ADR-0011 grades feature privacy, and this is the top of that grade.
 *
 * The source text is deliberately NOT stored on the proposal — a pasted bank statement is
 * not something to keep a second copy of. That is why a refinement needs the box to still
 * hold it, and why `body` goes null the moment it is empty: `RefinementBox` disables itself
 * on the same value that would have built the request, so the two cannot disagree.
 */
export function ImportTool({
  pending,
  categories,
  currency,
}: {
  /** Pending `import` proposals only — the page filters by kind at the query. */
  pending: ProposalRow[]
  categories: CategoryOption[]
  currency: string
}) {
  const [paste, setPaste] = React.useState("")
  // No `onApplied`: the transactions land on this page, so the hook's default — refresh in
  // place — puts them in the list below rather than navigating somewhere to show them.
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

  const text = paste.trim()

  return (
    <div className="flex flex-col gap-4">
      <ToolPanel
        icon={ClipboardPaste}
        title="Read transactions"
        description="Paste a bank export or a statement and it proposes rows you can prune before anything is added. Unlike every other AI job in the app, the text you paste is sent to the provider."
        refine={
          active && payload?.kind === "import"
            ? {
                kind: "import",
                value: proposal.instruction,
                onChange: proposal.setInstruction,
                body: text
                  ? { kind: "import", text, proposalId: active.id }
                  : null,
                busy,
                onRefine: (body) => void proposal.generate(body),
              }
            : null
        }
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!text) return
            void proposal.generate({ kind: "import", text })
          }}
        >
          <Textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={"2026-07-14,TESCO,-42.10\n2026-07-15,SALARY,2400.00"}
            aria-label="Transactions to read"
            rows={3}
            className="font-mono text-xs"
          />
          <Button
            type="submit"
            variant="outline"
            className="self-start"
            disabled={busy || !text}
            aria-busy={busy}
          >
            {busy ? "Reading…" : "Read them"}
          </Button>
        </form>
      </ToolPanel>

      {active && payload?.kind === "import" && (
        <ImportProposal
          key={proposal.version}
          payload={payload.payload}
          categories={categories}
          currency={currency}
          pending={busy}
          onApply={(next) => proposal.apply({ kind: "import", payload: next })}
          onDiscard={proposal.discard}
        />
      )}
    </div>
  )
}
