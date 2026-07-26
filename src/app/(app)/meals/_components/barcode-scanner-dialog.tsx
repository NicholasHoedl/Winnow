"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { isLikelyBarcode } from "@/modules/meals/service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * Why the camera might not be usable. Each case gets its own sentence, because
 * "camera unavailable" is useless when the actual problem is that you're on
 * http://<lan-ip> instead of the Tailscale HTTPS address — which is a real and easy
 * mistake for this deployment.
 */
type CameraBlock =
  "insecure" | "unsupported" | "denied" | "no-camera" | "failed"

const BLOCK_MESSAGE: Record<CameraBlock, string> = {
  insecure:
    "Camera scanning needs a secure connection. Open Winnow over its HTTPS address, or type the barcode below.",
  unsupported: "This browser can't use the camera. Type the barcode below.",
  denied:
    "Camera access was blocked. Allow it in your browser's site settings, or type the barcode below.",
  "no-camera": "No camera available on this device. Type the barcode below.",
  failed: "Couldn't start the camera. Type the barcode below.",
}

function classifyCameraError(error: unknown): CameraBlock {
  const name = error instanceof Error ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") return "denied"
  if (
    name === "NotFoundError" ||
    name === "OverconstrainedError" ||
    name === "NotReadableError"
  ) {
    return "no-camera"
  }
  return "failed"
}

/**
 * Scan a retail barcode with the device camera, falling back to typing it.
 *
 * The manual field is ALWAYS rendered, not just on failure — it is the only path that
 * works everywhere, and on a desktop browser it's the fast one.
 *
 * `@zxing/browser` is imported inside the effect rather than at module scope, so the
 * library is fetched the first time someone opens this dialog and never as part of the
 * meals page. The component itself is additionally loaded via next/dynamic by its
 * caller — two levels, because either one alone still ships it with the page.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (barcode: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  // zxing's callback fires continuously once it locks on; this makes one scan session
  // yield exactly one result.
  const doneRef = React.useRef(false)
  const [block, setBlock] = React.useState<CameraBlock | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [manual, setManual] = React.useState("")

  React.useEffect(() => {
    if (!open) return

    doneRef.current = false
    let stop: (() => void) | null = null
    let cancelled = false

    async function start() {
      // Ordered cheapest-first, and both checks are real: a secure context is required
      // for getUserMedia, and this app is routinely reachable over plain http on the LAN.
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setBlock("insecure")
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setBlock("unsupported")
        return
      }

      setStarting(true)
      try {
        // A 1D-only reader: groceries are EAN/UPC, and refusing to decode QR codes
        // means a poster in the background can't hijack the scan.
        const { BrowserMultiFormatOneDReader } = await import("@zxing/browser")
        if (cancelled) return

        const reader = new BrowserMultiFormatOneDReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (!result || doneRef.current) return
            doneRef.current = true
            // Stop before handing back, so the camera light goes out immediately
            // rather than whenever the parent gets round to closing us.
            controls.stop()
            onDetected(result.getText())
          },
        )
        stop = () => controls.stop()
        if (cancelled) controls.stop()
      } catch (error) {
        if (!cancelled) setBlock(classifyCameraError(error))
      } finally {
        if (!cancelled) setStarting(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      // Runs on close AND on unmount, so the stream can't outlive the dialog.
      stop?.()
    }
  }, [open, onDetected])

  // Reset in the event handler, not an effect — see food-manager.tsx.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setBlock(null)
      setManual("")
    }
    onOpenChange(next)
  }

  const trimmed = manual.trim()
  const manualValid = isLikelyBarcode(trimmed)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan a barcode</DialogTitle>
          <DialogDescription>
            Point the camera at the barcode on the packet.
          </DialogDescription>
        </DialogHeader>

        {block ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            {BLOCK_MESSAGE[block]}
          </p>
        ) : (
          <div className="bg-muted relative overflow-hidden rounded-lg">
            {/* muted + playsInline are required for autoplay on iOS. */}
            <video
              ref={videoRef}
              className="aspect-video w-full object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />
            {starting && (
              <p className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Starting camera…
              </p>
            )}
          </div>
        )}

        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (manualValid) onDetected(trimmed)
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="scan-manual">Or type the barcode</FieldLabel>
            <Input
              id="scan-manual"
              // Numeric keypad on phones; the value is digits either way.
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 3017620422003"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={!manualValid}>
            Look up
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
