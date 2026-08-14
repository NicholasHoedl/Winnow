"use client"

import { Wand2 } from "lucide-react"

import type { ActivePayload } from "@/modules/companion/use-proposal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Per-kind copy, as lookups rather than nested ternaries.
 *
 * The ternaries these replace stopped at `routine` and let `import` fall through to the
 * summary's wording — and the same fall-through in the request builder meant refining an
 * extraction asked the server for a WEEKLY SUMMARY. A `Record` keyed on the union fails to
 * compile when a fifth kind arrives; a ternary chain silently picks the last branch.
 */
const KIND_NOUN: Record<ActivePayload["kind"], string> = {
  goal_plan: "plan",
  routine: "routine",
  summary: "summary",
  import: "extraction",
}

const PLACEHOLDER: Record<ActivePayload["kind"], string> = {
  goal_plan: "Make it three months — drop anything before March…",
  routine: "Add a walk — move the prep to two days before…",
  summary: "Be blunter — say more about the money…",
  import: "Drop the refunds — put the coffees under Food…",
}

/**
 * "Change this plan" — one instruction against the proposal on screen.
 *
 * Not a chat, and the distinction is structural rather than stylistic: each turn sends the
 * proposal plus this one instruction, so there is no transcript to manage and nothing to
 * infer about which job was meant. The provider is asked to edit a payload, not to
 * remember a conversation.
 *
 * `body` carries the whole request minus the instruction, and **null means "cannot refine
 * this right now"** — which happens for an extraction whose source text has been cleared
 * out of the box, i.e. every extraction after a reload. Nullable rather than a separate
 * `disabled` flag on purpose: the render disables the box on the same value that would
 * have built the request, so the two can never disagree. The text is deliberately not
 * stored on the proposal — a pasted bank statement is not something to keep a second copy
 * of.
 */
export function RefinementBox({
  kind,
  value,
  onChange,
  body,
  busy,
  onRefine,
}: {
  kind: ActivePayload["kind"]
  value: string
  onChange: (value: string) => void
  /** The request minus `instruction`, or null when this proposal cannot be refined. */
  body: Record<string, unknown> | null
  busy: boolean
  onRefine: (body: Record<string, unknown>) => void
}) {
  return (
    <form
      className="flex flex-col gap-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = value.trim()
        if (!trimmed || !body) return
        onChange("")
        onRefine({ ...body, instruction: trimmed })
      }}
    >
      <label
        htmlFor="refine"
        className="text-muted-foreground text-xs font-medium"
      >
        Change this {KIND_NOUN[kind]}
      </label>
      <div className="flex gap-2">
        <Input
          id="refine"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // Off when there is nothing to build a request from. Said here rather than on
          // submit: a box that takes a sentence and then refuses it is worse than one that
          // explains itself while empty.
          disabled={!body}
          placeholder={
            body
              ? PLACEHOLDER[kind]
              : "Put the transactions back in the box above to change this"
          }
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label="Revise the proposal"
          aria-busy={busy}
          disabled={!body}
        >
          <Wand2 className="size-4" />
        </Button>
      </div>
    </form>
  )
}
