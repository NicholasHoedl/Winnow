"use client"

import type * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The frame a proposal is reviewed in.
 *
 * A plan is a full screen of review — milestones, habits, setup tasks, each prunable —
 * which is why ADR-0015 gave it the goals PAGE rather than a rail. A dialog can hold that
 * too, and holds it better than a panel above the list did: the list stays put underneath,
 * and the proposal has the viewport.
 *
 * Wide and flex-column on purpose. `DialogContent` is a scrolling grid by default; here the
 * dialog itself must NOT scroll, so that `PlanProposal` in its dialog frame can pin its
 * header and its Discard / Apply footer and scroll only the plan between them — a long
 * plan should never put Apply out of reach. The title is for the accessibility tree; the
 * renderer draws the visible one.
 *
 * Closing it — Escape, the ✕ — is not a decision. The proposal stays pending, and the page
 * offers a way back to it.
 */
export function PlanReviewDialog({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-y-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
