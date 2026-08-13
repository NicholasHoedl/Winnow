"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Lifted clear of the mobile BottomNav, which sonner paints over: it portals with a
      // very high z-index and the nav is only `z-40`. Cosmetic for "Saved", not for this
      // app — deleting a transaction, logging a habit and deleting a task all put a
      // time-limited UNDO in the toast, and those buttons were landing on top of nav
      // links. A few seconds to notice, and the two taps were in the same place.
      //
      // Both offsets, deliberately. Sonner switches between them at 600px; the nav
      // disappears at 768px. Feeding both from one variable means only the variable's own
      // media query decides, and it is keyed to the nav's breakpoint.
      //
      // Objects rather than a bare value: sonner fills unspecified sides from its own
      // defaults (24px desktop, 16px mobile), so this moves the bottom and nothing else.
      // At `md` and up the variable is 0px, which lands on exactly sonner's 24px default.
      offset={{ bottom: "calc(var(--bottom-nav-height) + 1.5rem)" }}
      mobileOffset={{ bottom: "calc(var(--bottom-nav-height) + 1.5rem)" }}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
