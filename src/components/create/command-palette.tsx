"use client"

// The ⌘K command palette: jump to any page or search across every module. Mounted once
// in the app shell. Owns its open state and the global keyboard shortcuts:
//   • ⌘K / Ctrl+K       toggle the palette (works even while typing)
//   • g then a/c/b/m/n/d  go to activity / calendar / budget / meals / notes / dashboard.
//                          `t` and `g` are kept as aliases for activity (T10). `g n` is
//                          unambiguous with the bare `n` below: the pending-g branch
//                          returns before it.
// Create commands + the `n` shortcut are added in T1-S4 (they produce create-intents).

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
  ClipboardList,
  Flame,
  ListChecks,
  ListTodo,
  NotebookPen,
  Search,
  Settings,
  Target,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { COMPANION_NAV_ITEM, navItems } from "@/components/shared/nav-items"
import { search } from "@/modules/search/actions"
import { MIN_QUERY_LENGTH } from "@/modules/search/service"
import type { SearchResult, SearchResultType } from "@/modules/search/types"

import { type CreateKind, useCreateIntent } from "./create-intent"

// A trigger (sidebar/mobile button) opens the palette by dispatching this event, so the
// button and the palette stay decoupled — no shared provider needed.
const OPEN_EVENT = "winnow:open-palette"

/** Open the command palette from anywhere (used by the visible trigger buttons). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

// `g`-then-letter navigation, matching the sidebar's routes.
//
// `t` and `g` both survive T10's merge as aliases for `/activity`. They addressed To-dos
// and Goals for the whole life of the app, and the muscle memory is in fingers this repo
// cannot update; sending them somewhere sensible costs one map entry, and breaking them
// would be a daily papercut for no gain.
const NAV_SHORTCUTS: Record<string, string> = {
  d: "/",
  a: "/activity",
  t: "/activity",
  g: "/activity",
  c: "/calendar",
  b: "/budget",
  m: "/meals",
  n: "/notes",
}

// Both exhaustive `Record<SearchResultType, …>` on purpose: adding a variant to the union
// without touching these two is a compile error, which is the only thing standing between a
// new searchable module and a result that renders with no icon and no label.
const RESULT_ICON: Record<SearchResultType, LucideIcon> = {
  task: ListTodo,
  event: CalendarDays,
  food: Utensils,
  transaction: Wallet,
  goal: Target,
  note: NotebookPen,
  // The same flame the Habits nav command uses — one icon, one meaning.
  habit: Flame,
}

const RESULT_LABEL: Record<SearchResultType, string> = {
  task: "Task",
  event: "Event",
  food: "Food",
  transaction: "Transaction",
  goal: "Goal",
  note: "Note",
  habit: "Habit",
}

type NavCommand = { href: string; label: string; icon: LucideIcon }

// The sub-routes are listed by hand for the same reason /settings is: they are real
// destinations that deliberately don't get a nav tab, so the palette is the only place
// they're discoverable without being on /activity already.
const NAV_COMMANDS: NavCommand[] = [
  ...navItems,
  { href: "/activity/habits", label: "Habits", icon: Flame },
  { href: "/activity/routines", label: "Routines", icon: ListChecks },
  { href: "/review", label: "Weekly review", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
]

// Create actions. Tasks open a create-in-place dialog via the create-intent bus; the
// other kinds navigate to their module for now (T1-S4 scope).
type CreateCommand = { label: string; icon: LucideIcon } & (
  { kind: CreateKind } | { href: string }
)

const CREATE_COMMANDS: CreateCommand[] = [
  { label: "New task", icon: ListTodo, kind: "task" },
  { label: "New event", icon: CalendarDays, href: "/calendar" },
  { label: "New transaction", icon: Wallet, href: "/budget" },
  { label: "Log a meal", icon: Utensils, href: "/meals" },
  { label: "New goal", icon: Target, href: "/activity" },
  { label: "New note", icon: NotebookPen, href: "/notes" },
  { label: "New routine", icon: ListChecks, href: "/activity/routines" },
  // `href`, not a `CreateKind`. A kind means a globally-mounted dialog in the app shell for
  // the whole app's lifetime, which is a lot to carry for a rare action — every other
  // command here except "New task" navigates, so this follows them. It does leave the same
  // half-command routines already have (you land on the page and click New habit again); if
  // that is ever fixed with a `?new=1` param it should be fixed for both at once.
  { label: "New habit", icon: Flame, href: "/activity/habits" },
]

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  )
}

export function CommandPalette({
  companionEnabled = false,
}: {
  /** Passed from the (app) layout, which can read the AI settings; this component cannot. */
  companionEnabled?: boolean
}) {
  const router = useRouter()
  const requestCreate = useCreateIntent()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const reqIdRef = React.useRef(0)

  const closePalette = React.useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setOpen(false)
    setQuery("")
    setResults([])
    setLoading(false)
  }, [])

  // Global keyboard: ⌘K toggles; `g`-then-letter navigates; `n` creates a task.
  React.useEffect(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | undefined

    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        if (open) closePalette()
        else setOpen(true)
        return
      }
      // Single-key shortcuts: never while the palette is open, typing, or a modifier is held.
      if (
        open ||
        isTypingTarget(e.target) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return
      }
      if (pendingG) {
        pendingG = false
        if (gTimer) clearTimeout(gTimer)
        const href = NAV_SHORTCUTS[e.key.toLowerCase()]
        if (href) {
          e.preventDefault()
          router.push(href)
        }
        return
      }
      if (e.key === "g") {
        pendingG = true
        gTimer = setTimeout(() => {
          pendingG = false
        }, 1200)
        return
      }
      if (e.key === "n") {
        e.preventDefault()
        requestCreate({ kind: "task" })
      }
    }

    function onOpenEvent() {
      setOpen(true)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(OPEN_EVENT, onOpenEvent)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(OPEN_EVENT, onOpenEvent)
      if (gTimer) clearTimeout(gTimer)
    }
  }, [open, router, requestCreate, closePalette])

  // Clear any pending debounce timer when the palette unmounts.
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Search runs from the input handler (not an effect), debounced; reqId drops a stale
  // response that resolves after a newer keystroke.
  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    const reqId = ++reqIdRef.current
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await search(q)
        if (reqId === reqIdRef.current) setResults(found)
      } catch {
        if (reqId === reqIdRef.current) setResults([])
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    }, 150)
  }

  function go(href: string) {
    closePalette()
    router.push(href)
  }

  function runCreate(command: CreateCommand) {
    if ("kind" in command) {
      closePalette()
      requestCreate({ kind: command.kind })
    } else {
      go(command.href)
    }
  }

  const q = query.trim().toLowerCase()
  const navCommands = companionEnabled
    ? [...NAV_COMMANDS, COMPANION_NAV_ITEM]
    : NAV_COMMANDS
  const navMatches = q
    ? navCommands.filter((c) => c.label.toLowerCase().includes(q))
    : navCommands
  const createMatches = q
    ? CREATE_COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
    : CREATE_COMMANDS

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : closePalette())}
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        value={query}
        onValueChange={handleQueryChange}
        aria-label="Search"
        placeholder="Search tasks, events, foods… or jump to a page"
      />
      <CommandList>
        <CommandEmpty>{loading ? "Searching…" : "No matches."}</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="Results">
            {results.map((r) => {
              const Icon = RESULT_ICON[r.type]
              return (
                <CommandItem
                  key={`${r.type}-${r.id}`}
                  value={`result-${r.type}-${r.id}`}
                  onSelect={() => go(r.href)}
                >
                  <Icon />
                  <span className="truncate">{r.title || "(untitled)"}</span>
                  {r.subtitle && (
                    <span className="text-muted-foreground truncate text-xs">
                      {r.subtitle}
                    </span>
                  )}
                  <CommandShortcut>{RESULT_LABEL[r.type]}</CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {createMatches.length > 0 && (
          <>
            {results.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Create">
              {createMatches.map((c) => (
                <CommandItem
                  key={"kind" in c ? `create-${c.kind}` : `create-${c.href}`}
                  value={"kind" in c ? `create-${c.kind}` : `create-${c.href}`}
                  onSelect={() => runCreate(c)}
                >
                  <c.icon />
                  <span>{c.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {navMatches.length > 0 && (
          <>
            {(results.length > 0 || createMatches.length > 0) && (
              <CommandSeparator />
            )}
            <CommandGroup heading="Go to">
              {navMatches.map((c) => (
                <CommandItem
                  key={c.href}
                  value={`nav-${c.href}`}
                  onSelect={() => go(c.href)}
                >
                  <c.icon />
                  <span>{c.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

/**
 * A button that opens the palette. Style it via `className`/`children` for each spot
 * (full-width in the sidebar, icon-only on mobile). Defaults to a "Search…" label.
 */
export function CommandPaletteTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={className}
      {...props}
    >
      {children ?? (
        <>
          <Search className="size-4" />
          <span>Search…</span>
        </>
      )}
    </button>
  )
}
