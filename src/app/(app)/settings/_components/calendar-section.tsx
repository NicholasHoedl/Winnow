"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Download, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { regenerateFeedToken } from "@/modules/calendar/actions"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"

import { SettingsSection } from "./settings-section"

export function CalendarSection({ feedUrl }: { feedUrl: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      // Purely a label reset; nothing depends on it, so a dropped timer is harmless.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (permissions, or a non-secure context). The URL
      // is on screen and selectable, so this is a nudge rather than a failure.
      toast.error("Couldn't copy — select the address and copy it manually.")
    }
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateFeedToken()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("New address generated")
      router.refresh()
    })
  }

  return (
    <SettingsSection
      title="Calendar"
      description="Subscribe to your Winnow events from another calendar app."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Subscribe by URL</p>
            <p className="text-muted-foreground text-sm">
              Add this address to Apple Calendar, Google Calendar, or anything
              else that reads iCalendar feeds. It updates as your events change.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <code
              // Long, unbreakable, and the whole point is being able to read it —
              // so let it scroll rather than wrap mid-token.
              className="bg-muted text-muted-foreground min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs whitespace-nowrap"
              data-testid="feed-url"
            >
              {feedUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            Anyone with this address can read your calendar, so treat it like a
            password. It only works from a device on your tailnet — off the
            tailnet, subscribed calendars simply stop refreshing until you are
            back on it.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Download a copy</p>
            <p className="text-muted-foreground text-sm">
              A one-off <code className="font-mono text-xs">.ics</code> snapshot
              of your events, rather than a live subscription.
            </p>
          </div>
          <a
            href="/settings/calendar.ics"
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" />
            Download
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Generate a new address</p>
            <p className="text-muted-foreground text-sm">
              Use this if the address has been shared by mistake. The old one
              stops working straight away.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            <RefreshCw className="size-4" />
            {pending ? "Generating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Generate a new calendar address?"
        description="The current address stops working immediately. Any calendar already subscribed to it will need to be removed and re-added with the new one."
        confirmLabel="Generate new address"
        onConfirm={handleRegenerate}
      />
    </SettingsSection>
  )
}
