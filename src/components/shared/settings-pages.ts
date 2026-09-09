import {
  Database,
  Globe,
  Lock,
  Palette,
  SlidersHorizontal,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react"

/**
 * The settings pages, in the order they are shown.
 *
 * **One list, three readers.** The tab strip draws its pills from it, the overview draws
 * its cards from it, and the command palette draws its "Settings · …" entries from it. A
 * page that exists in one of those and not the others is the failure this file prevents:
 * three hand-written lists that must agree is exactly the kind of pair — triple — that
 * drifts silently, and the palette's own note already records `/review` being listed
 * under two names for that reason.
 *
 * Beside `nav-items.ts` rather than under the settings route, for the reason that file
 * lives here: the command palette reads it, and a shared component reaching into a
 * route's private `_components` folder is the coupling that folder name exists to forbid.
 *
 * Plain data rather than components, so it can be imported by server and client code
 * alike. The icons are lucide components, which cross that boundary fine — it is functions
 * passed as PROPS that cannot, and these are read, not passed.
 *
 * `description` is a sentence, not a label: on the overview it is the whole of what tells
 * you which page holds the thing you are looking for.
 */
export type SettingsPage = {
  href: `/settings/${string}`
  label: string
  description: string
  icon: LucideIcon
}

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  {
    href: "/settings/account",
    label: "Account",
    description:
      "Your name, your sign-in email, and signing out of this device.",
    icon: User,
  },
  {
    href: "/settings/security",
    label: "Security",
    description: "Change the password you sign in with.",
    icon: Lock,
  },
  {
    href: "/settings/appearance",
    label: "Appearance",
    description: "Light, dark, or whatever this device is doing.",
    icon: Palette,
  },
  {
    href: "/settings/region",
    label: "Region",
    description:
      "Time zone, currency, and how dates, times and measurements read.",
    icon: Globe,
  },
  {
    href: "/settings/defaults",
    label: "Defaults",
    description:
      "Where the app opens, what it files things under, how it judges a goal — and the daily digest.",
    icon: SlidersHorizontal,
  },
  {
    href: "/settings/ai",
    label: "AI companion",
    description:
      "The provider, the model and the key behind every plan and summary.",
    icon: Sparkles,
  },
  {
    href: "/settings/data",
    label: "Data",
    description:
      "Export a backup, restore one, subscribe from another calendar, or clear everything.",
    icon: Database,
  },
]
