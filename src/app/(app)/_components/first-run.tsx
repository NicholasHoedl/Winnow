import Link from "next/link"
import { CalendarPlus, Share, Target, Wallet } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"

/**
 * What a brand-new account sees instead of five separate "Nothing yet" messages.
 *
 * `scripts/seed-user.ts` creates an account and nothing else, so the first sign-in lands on a
 * dashboard whose every card is empty and whose empty copy — good copy, individually — adds
 * up to no answer for "what do I do now". This is the answer, and it disappears the moment
 * anything at all exists.
 *
 * A server component with no state: it is rendered or it is not, decided upstream by
 * `isFirstRun`. Nothing is dismissible, because a dismissal would need a preference column to
 * remember it and the condition already stops being true as soon as you act on it.
 */
export function FirstRun() {
  return (
    <section
      aria-labelledby="first-run-heading"
      className="bg-card ring-foreground/5 mb-5 rounded-xl p-5 shadow-sm ring-1"
    >
      <h2
        id="first-run-heading"
        className="font-display text-xl font-semibold tracking-tight"
      >
        Nothing here yet — that&apos;s expected
      </h2>
      <p className="text-muted-foreground mt-1 max-w-prose text-sm">
        Winnow fills in as you use it. The quick-add above takes a task in plain
        language, and everything else starts from one of these.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/goals"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Target className="size-4" />
          Set a goal
        </Link>
        <Link
          href="/calendar"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <CalendarPlus className="size-4" />
          Add an event
        </Link>
        <Link
          href="/budget"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Wallet className="size-4" />
          Set up a budget
        </Link>
      </div>

      {/* The one thing nothing else in the app ever says, and the step that turns this from a
          website into the thing it was built to be. Phrased for any device rather than gated
          on a user-agent sniff — a server render has no honest way to know, and the sentence
          costs a laptop reader one line. */}
      <p className="text-muted-foreground mt-4 flex items-start gap-2 border-t pt-4 text-sm">
        <Share aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          On your phone, open this page in Safari and choose{" "}
          <strong className="font-medium">Share → Add to Home Screen</strong> to
          install it. It then opens like an app, without the browser chrome.
        </span>
      </p>
    </section>
  )
}
