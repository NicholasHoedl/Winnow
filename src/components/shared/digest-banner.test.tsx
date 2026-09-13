import { afterEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import type { Digest } from "@/modules/digest/service"

import { DigestBanner } from "./digest-banner"

/**
 * The banner's two jobs, now that the digest itself arrives as a prop from the server
 * render (T45): draw what it was handed, and decide — from this device's storage — whether
 * today has already had one.
 *
 * Worth a component test precisely because the decision is client-side and invisible to the
 * server. `e2e/digest.spec.ts` proves the once-a-day behaviour in a real browser; what is
 * cheaper to prove here is the shape the server cannot see — that a digest already seen
 * today renders hidden rather than absent, and that dismissing it hides it without waiting
 * on anything.
 */

const TODAY = "2026-09-12"
const USER = "user-1"
const KEY = `winnow:digest-seen:${USER}`

const DIGEST: Digest = {
  overdueCount: 1,
  dueTodayCount: 2,
  events: [{ title: "Standup", time: "09:30" }],
  unmetMacros: [{ label: "protein", remaining: 40, unit: "g" }],
}

function show(digest: Digest | null = DIGEST) {
  return render(
    <DigestBanner
      userId={USER}
      today={TODAY}
      digest={digest}
      use24Hour={false}
    />,
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe("DigestBanner", () => {
  it("draws the digest it was handed, without fetching one", () => {
    show()
    const banner = screen.getByRole("status")
    expect(banner).toBeVisible()
    // 1 overdue + 2 due today, summarised by `digestHeadline`.
    expect(banner).toHaveTextContent("3 tasks and 1 event today")
    expect(banner).toHaveTextContent("1 overdue · 2 due today")
    expect(banner).toHaveTextContent("Standup")
    expect(banner).toHaveTextContent("40g protein")
  })

  it("records the day as soon as it shows, so a second page does not repeat it", () => {
    show()
    expect(window.localStorage.getItem(KEY)).toBe(TODAY)
  })

  it("renders nothing at all when the server had nothing to say", () => {
    show(null)
    expect(screen.queryByRole("status", { hidden: true })).toBeNull()
  })

  it("still records a quiet day, so it cannot reappear on the next page", () => {
    // The key has always meant "this device has had its digest for today", not "a digest
    // was shown" — `e2e/auth.setup.ts` bakes it into the saved session on that reading.
    show(null)
    expect(window.localStorage.getItem(KEY)).toBe(TODAY)
  })

  it("renders nothing when this device has already seen today's", () => {
    window.localStorage.setItem(KEY, TODAY)
    show()
    // Absent, not merely hidden — `{ hidden: true }` would find it either way, and a
    // hidden copy of "N overdue · N due today" above the page body is what a loose
    // `getByText` in a browser test picks up first (it broke `goals-linked-tasks`).
    expect(screen.queryByRole("status", { hidden: true })).toBeNull()
  })

  it("shows again once the stored day is no longer today", () => {
    window.localStorage.setItem(KEY, "2026-09-11")
    show()
    expect(screen.getByRole("status")).toBeVisible()
  })

  it("goes on dismiss", () => {
    show()
    fireEvent.click(screen.getByLabelText("Dismiss digest"))
    expect(screen.queryByRole("status", { hidden: true })).toBeNull()
  })
})
