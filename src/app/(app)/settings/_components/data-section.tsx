"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { clearAllData } from "@/modules/account/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { SettingsSection } from "./settings-section"

const CONFIRM_WORD = "DELETE"

export function DataSection() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function handleClear() {
    startTransition(async () => {
      const result = await clearAllData()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("All data cleared")
      setOpen(false)
      setConfirm("")
      router.refresh()
    })
  }

  return (
    <SettingsSection
      title="Data"
      description="Export or erase everything in your account."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Export your data</p>
            <p className="text-muted-foreground text-sm">
              Download all your tasks, events, budget, and meals as JSON.
            </p>
          </div>
          <a
            href="/settings/export"
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" />
            Export
          </a>
        </div>

        <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">Clear all data</p>
              <p className="text-muted-foreground text-sm">
                Permanently delete every task, event, transaction, budget, and
                meal. Your account and sign-in stay. This can&apos;t be undone.
              </p>
            </div>
          </div>
          <div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
            >
              Clear all data
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setConfirm("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This permanently deletes all your tasks, events, budget, and meals.
              Your account stays. Type <strong>{CONFIRM_WORD}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="confirm-clear">Type {CONFIRM_WORD}</FieldLabel>
            <Input
              id="confirm-clear"
              value={confirm}
              autoComplete="off"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== CONFIRM_WORD || pending}
              onClick={handleClear}
            >
              {pending ? "Clearing…" : "Clear everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
