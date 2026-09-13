import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { Flame, ListTodo } from "lucide-react"

/**
 * `next/link` CONSUMES `prefetch` — it never reaches the `<a>` — so a component test can
 * only see the decision by standing in for the link. Hoisted, because `vi.mock`'s factory
 * runs before the module body.
 */
const { linkProps } = vi.hoisted(() => ({
  linkProps: [] as { href: string; prefetch: unknown }[],
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: React.ReactNode
    href: string
    prefetch?: boolean
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    linkProps.push({ href, prefetch })
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

import { PageTabs } from "./page-tabs"

const TABS = [
  { href: "/activity", label: "Tasks", icon: ListTodo, active: true },
  { href: "/activity/habits", label: "Habits", icon: Flame, active: false },
]

describe("PageTabs", () => {
  it("does not prefetch its pills", () => {
    // Five to seven pills per strip, on routes whose prefetched payload Next's client
    // router cache keeps for zero seconds (they are all dynamic — `auth()` reads cookies).
    // So each pill was a round trip that bought the loading skeleton and nothing else.
    linkProps.length = 0
    render(<PageTabs label="Activity sections" tabs={TABS} />)

    expect(linkProps).toEqual([
      { href: "/activity", prefetch: false },
      { href: "/activity/habits", prefetch: false },
    ])
  })

  it("marks the lit pill as the current page", () => {
    render(<PageTabs label="Activity sections" tabs={TABS} />)
    expect(screen.getByRole("link", { name: /Tasks/ })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: /Habits/ })).not.toHaveAttribute(
      "aria-current",
    )
  })
})
