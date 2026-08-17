"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, TriangleAlert, Upload } from "lucide-react"
import { toast } from "sonner"

import { clearAllData, importUserData } from "@/modules/account/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmWordDialog } from "@/components/ui/confirm-word-dialog"

import { SettingsSection } from "./settings-section"

const CONFIRM_WORD = "DELETE"
const REPLACE_WORD = "REPLACE"

export function DataSection() {
  const router = useRouter()
  const [clearOpen, setClearOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // The chosen file is held until the confirmation is typed, so the picker and the
  // destructive act are two separate decisions rather than one.
  const [staged, setStaged] = React.useState<{
    name: string
    payload: unknown
  } | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  function handleClear() {
    startTransition(async () => {
      const result = await clearAllData()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("All data cleared")
      setClearOpen(false)
      router.refresh()
    })
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change event.
    event.target.value = ""
    if (!file) return
    try {
      const payload: unknown = JSON.parse(await file.text())
      setStaged({ name: file.name, payload })
    } catch {
      toast.error("That file isn't valid JSON.")
    }
  }

  function handleImport() {
    if (!staged) return
    startTransition(async () => {
      const result = await importUserData(staged.payload)
      if (!result.ok) {
        // The import validates before it deletes anything, so a rejected file has cost
        // nothing — say so, or the message reads like a half-finished restore.
        toast.error(`${result.error} Nothing was changed.`)
        return
      }
      toast.success("Backup restored")
      setStaged(null)
      router.refresh()
    })
  }

  return (
    <SettingsSection title="Data">
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Restore from a backup</p>
            <p className="text-muted-foreground text-sm">
              Replace everything in your account with the contents of an
              exported file.
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Backup file"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            Choose file
          </Button>
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
              onClick={() => setClearOpen(true)}
            >
              Clear all data
            </Button>
          </div>
        </div>
      </div>

      <ConfirmWordDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all data?"
        description={
          <>
            This permanently deletes all your tasks, events, budget, and meals.
            Your account stays. Type <strong>{CONFIRM_WORD}</strong> to confirm.
          </>
        }
        word={CONFIRM_WORD}
        confirmLabel="Clear everything"
        pendingLabel="Clearing…"
        pending={pending}
        onConfirm={handleClear}
      />

      <ConfirmWordDialog
        open={staged !== null}
        onOpenChange={(open) => !open && setStaged(null)}
        title="Restore from this backup?"
        description={
          <>
            Everything in your account will be deleted and replaced with the
            contents of <strong>{staged?.name}</strong>. This can&apos;t be
            undone. Type <strong>{REPLACE_WORD}</strong> to confirm.
          </>
        }
        word={REPLACE_WORD}
        confirmLabel="Replace everything"
        pendingLabel="Restoring…"
        pending={pending}
        onConfirm={handleImport}
      />
    </SettingsSection>
  )
}
