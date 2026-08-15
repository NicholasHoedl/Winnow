"use client"

import type { LucideIcon } from "lucide-react"

import type { ActivePayload } from "@/modules/companion/use-proposal"

import { RefinementBox } from "./refinement-box"

/**
 * The frame around one AI job, on the page of the artifact it produces.
 *
 * T13 put each job with its own output — a plan with goals, a routine with routines, a
 * narrated week with the review, an extraction with the budget — and this is the part all
 * four have in common: a titled card, a sentence saying what it does, the job's own control,
 * and the refinement box once there is something to refine.
 *
 * **It deliberately does not wrap the RENDERER.** The four proposal renderers draw their own
 * header, body, footer and Discard/Apply, and they differ enough in the middle that a
 * generic wrapper round them would end up parameterised into unreadability — that call was
 * made in T13 Phase 2 and still holds. This wraps the INPUT side, which really is the same
 * four times.
 *
 * The control is `children` rather than a prop, because each job's input is a different
 * shape: a select, a text field, a textarea, a bare button.
 */
export function ToolPanel({
  icon: Icon,
  title,
  description,
  children,
  refine,
}: {
  icon: LucideIcon
  title: string
  description: React.ReactNode
  children: React.ReactNode
  /**
   * The refinement box's wiring, or null when nothing is open to refine.
   *
   * One object rather than five loose props: they are meaningless apart, and passing them
   * individually invites a call site that supplies four of them.
   */
  refine: {
    kind: ActivePayload["kind"]
    value: string
    onChange: (value: string) => void
    /** The request minus `instruction` — null disables the box. See `RefinementBox`. */
    body: Record<string, unknown> | null
    busy: boolean
    onRefine: (body: Record<string, unknown>) => void
  } | null
}) {
  return (
    <section
      aria-label={title}
      className="bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Icon className="text-brand-accent size-4" />
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>

      {children}

      {refine && <RefinementBox {...refine} />}
    </section>
  )
}
