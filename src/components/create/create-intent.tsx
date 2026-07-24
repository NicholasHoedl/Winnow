"use client"

// Create-intent bus: a tiny in-app event channel that decouples *what wants to create
// something* (the ⌘K palette, the dashboard quick-capture bar, an `n` shortcut, a "New"
// button) from *the dialog that actually creates it* (each module's create dialog).
//
// A producer calls `requestCreate({ kind, text?, date? })`; every consumer registered
// for that `kind` via `useCreateIntentListener` fires, opening its dialog seeded with the
// optional text/date. Using a listener set (rather than a single "current intent" slot)
// keeps producers fire-and-forget and lets the same intent be requested twice in a row
// without a nonce dance.
//
// The provider is app-wide plumbing (mounted in the app shell alongside the other
// providers — wired in T1-S4). Whether a given `kind` is served by a page-local dialog or
// an always-mounted "global create dialog" is the consumer's choice; this bus is neutral.

import * as React from "react"

/** The things Winnow can create from a quick-capture surface. */
export type CreateKind = "task" | "event" | "transaction" | "meal" | "goal"

export type CreateIntent = {
  kind: CreateKind
  /** Free text to seed the dialog (e.g. a quick-capture line, pre natural-language parse). */
  text?: string
  /** A due/target date (YYYY-MM-DD) to seed, e.g. from the calendar or an NL parse. */
  date?: string
}

type Listener = (intent: CreateIntent) => void

type CreateIntentContextValue = {
  requestCreate: (intent: CreateIntent) => void
  subscribe: (listener: Listener) => () => void
}

const CreateIntentContext =
  React.createContext<CreateIntentContextValue | null>(null)

export function CreateIntentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // A ref (not state) so subscribing/unsubscribing never re-renders producers, and the
  // context value stays referentially stable for the life of the provider.
  const listenersRef = React.useRef<Set<Listener>>(null)
  if (listenersRef.current === null) listenersRef.current = new Set()

  const value = React.useMemo<CreateIntentContextValue>(
    () => ({
      requestCreate: (intent) => {
        // Copy first: a listener that opens a dialog may mount/unmount others.
        for (const listener of [...listenersRef.current!]) listener(intent)
      },
      subscribe: (listener) => {
        listenersRef.current!.add(listener)
        return () => {
          listenersRef.current!.delete(listener)
        }
      },
    }),
    [],
  )

  return (
    <CreateIntentContext.Provider value={value}>
      {children}
    </CreateIntentContext.Provider>
  )
}

function useCreateIntentContext(hook: string): CreateIntentContextValue {
  const ctx = React.useContext(CreateIntentContext)
  if (!ctx) {
    throw new Error(`${hook} must be used within a <CreateIntentProvider>`)
  }
  return ctx
}

/**
 * Producer hook — returns `requestCreate(intent)`. Call it from a palette action, the
 * quick-capture bar, a keyboard shortcut, or a "New" button.
 */
export function useCreateIntent(): (intent: CreateIntent) => void {
  return useCreateIntentContext("useCreateIntent").requestCreate
}

/**
 * Consumer hook — runs `handler` whenever an intent for `kind` is requested. Mount it in
 * a module's create dialog to open (and seed) itself. The handler is always the latest
 * closure without re-subscribing on every render.
 */
export function useCreateIntentListener(
  kind: CreateKind,
  handler: (intent: CreateIntent) => void,
): void {
  const ctx = useCreateIntentContext("useCreateIntentListener")

  const handlerRef = React.useRef(handler)
  React.useEffect(() => {
    handlerRef.current = handler
  })

  React.useEffect(() => {
    return ctx.subscribe((intent) => {
      if (intent.kind === kind) handlerRef.current(intent)
    })
  }, [ctx, kind])
}
