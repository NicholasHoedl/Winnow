import {
  Flame,
  Folder,
  ListChecks,
  ListTodo,
  Repeat,
  type LucideIcon,
} from "lucide-react"

/**
 * The Activity section's pages, in the order the strip shows them.
 *
 * One list, two readers — the tab strip and the command palette — for the reason
 * `settings-pages.ts` gives: two hand-written lists that must agree drift silently, and the
 * palette's own note records `/review` once being listed under two names.
 *
 * Four of these were reachable only by knowing where to look: a bare arrow beside the
 * habit strip, a muted link at the head of the routines row, and two entries in an
 * unlabeled ⋮ menu. ADR-0020 is why they are destinations in a strip now.
 *
 * Beside `nav-items.ts` rather than under the route, for the reason `settings-pages.ts`
 * lives here: the palette reads it, and a shared component reaching into a route's private
 * `_components` folder is the coupling that folder name exists to forbid.
 */
export type ActivityPage = {
  href: "/activity" | `/activity/${string}`
  label: string
  icon: LucideIcon
}

export const ACTIVITY_PAGES: readonly ActivityPage[] = [
  { href: "/activity", label: "Tasks", icon: ListTodo },
  { href: "/activity/habits", label: "Habits", icon: Flame },
  { href: "/activity/routines", label: "Routines", icon: ListChecks },
  { href: "/activity/lists", label: "Lists", icon: Folder },
  // "Repeating tasks", not "Repeating": alone in a strip the word is a question, and in
  // the palette it is what someone types.
  { href: "/activity/repeating", label: "Repeating tasks", icon: Repeat },
]
