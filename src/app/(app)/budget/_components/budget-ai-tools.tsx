"use client"

import * as React from "react"
import { Camera, ClipboardPaste, ScanLine } from "lucide-react"

import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import { resizeImageFile, type ResizedImage } from "@/lib/resize-image"
import {
  ImportProposal,
  type CategoryOption,
} from "@/components/companion/import-proposal"
import { ToolPanel } from "@/components/companion/tool-panel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * The budget page's two AI jobs, "Read transactions" and "Scan a receipt", on the ledger
 * they land in. One component rather than two because the two jobs share ONE queue: both
 * produce `import` proposals, `useProposal` opens whichever is pending, and two hooks
 * over the same list would render the same proposal twice.
 *
 * **These are the jobs that send your own financial detail to the provider**, and each
 * panel says so above its input rather than leaving it to be discovered. Every other
 * prompt in the app sends titles, descriptions or already-summed figures; these send the
 * text you paste and the photo you take, because that is the feature. ADR-0011 grades
 * feature privacy, and both sit at the top of that grade.
 *
 * Neither source is stored on the proposal — a pasted bank statement is not something to
 * keep a second copy of, and a photo of a receipt even less so. That is why a refinement
 * needs the box or the panel to still hold its input, and why `body` goes null the
 * moment it does not: `RefinementBox` disables itself on the same value that would have
 * built the request, so the two cannot disagree. Which panel offers the refinement
 * follows the proposal's own `source`, so a scan is revised as a scan.
 */
export function BudgetAiTools({
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
  const [image, setImage] = React.useState<ResizedImage | null>(null)
  // No `onApplied`: the transactions land on this page, so the hook's default — refresh in
  // place — puts them in the list below rather than navigating somewhere to show them.
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

  const text = paste.trim()
  const importPayload =
    active && payload?.kind === "import" ? payload.payload : null
  const source = importPayload?.source ?? "text"

  function refineFor(which: "text" | "receipt") {
    if (!active || !importPayload || source !== which) return null
    const body =
      which === "text"
        ? text
          ? { kind: "import", text, proposalId: active.id }
          : null
        : image
          ? {
              kind: "receipt",
              image: { mediaType: image.mediaType, data: image.data },
              proposalId: active.id,
            }
          : null
    return {
      kind: "import" as const,
      value: proposal.instruction,
      onChange: proposal.setInstruction,
      body,
      busy,
      onRefine: (request: Record<string, unknown>) =>
        void proposal.generate(request),
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolPanel
        icon={ClipboardPaste}
        title="Read transactions"
        description="Paste a bank export or a statement and it proposes rows you can prune before anything is added. Unlike every other AI job in the app, the text you paste is sent to the provider."
        refine={refineFor("text")}
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

      <ReceiptPanel
        image={image}
        onImage={setImage}
        busy={busy}
        refine={refineFor("receipt")}
        onRead={() => {
          if (!image) return
          void proposal.generate({
            kind: "receipt",
            image: { mediaType: image.mediaType, data: image.data },
          })
        }}
      />

      {importPayload && (
        <ImportProposal
          key={proposal.version}
          payload={importPayload}
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

/**
 * "Scan a receipt": a photo in, one transaction per category out (T33, ADR-0028).
 *
 * A plain file input, not the barcode scanner's live camera. On a phone the input opens
 * the camera or the photo library — both are wanted, since the receipt may have been
 * photographed earlier — and on a desktop it opens the file picker. The photo is shrunk
 * on the device before anything is sent (`resizeImageFile`) and shown back as a preview
 * so the wrong picture is caught before a call is spent.
 */
function ReceiptPanel({
  image,
  onImage,
  busy,
  refine,
  onRead,
}: {
  image: ResizedImage | null
  onImage: (image: ResizedImage | null) => void
  busy: boolean
  refine: React.ComponentProps<typeof ToolPanel>["refine"]
  onRead: () => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again after a discard still fires `change`.
    event.target.value = ""
    if (!file) return
    try {
      onImage(await resizeImageFile(file))
      setError(null)
    } catch {
      onImage(null)
      setError(
        "That file couldn't be read as a photo. Use a JPEG, PNG or WebP.",
      )
    }
  }

  return (
    <ToolPanel
      icon={ScanLine}
      title="Scan a receipt"
      description="Photograph a receipt and it proposes one transaction per category of item, with tax spread across them, for you to check and edit before anything is added. Like the paste box above, the photo is sent to the provider — and it is never stored."
      refine={refine}
    >
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          aria-label="Receipt photo"
          className="sr-only"
          onChange={handleFile}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-4" />
            {image ? "Choose another photo" : "Choose a photo"}
          </Button>
          <Button
            type="button"
            disabled={busy || !image}
            aria-busy={busy}
            onClick={onRead}
          >
            {busy ? "Reading…" : "Read the receipt"}
          </Button>
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL preview, not an asset
          <img
            src={image.previewUrl}
            alt="The receipt you chose"
            className="max-h-40 w-auto self-start rounded-md border"
          />
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </ToolPanel>
  )
}
