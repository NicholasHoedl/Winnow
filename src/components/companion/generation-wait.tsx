/**
 * How long an AI job can run, said while one is running.
 *
 * Every measured interaction in this app lands inside 200ms, and these five triggers do
 * not: `GENERATE_TIMEOUT_MS` is 90 seconds, spent waiting on somebody's self-hosted model
 * over a home connection. Until T43 the whole of that wait was a one-word label change on
 * the button — "Reading…", "Thinking…" — which reads as a hang long before the minute is
 * up, and the usual answer to "is it stuck?" is a second click.
 *
 * One component rather than five paragraphs so the five agree, and so the number has one
 * place to change if the timeout ever does. The bound is stated, not a typical time: a
 * generous estimate that is beaten is a pleasant surprise, and an optimistic one that is
 * missed is the same hang with extra steps.
 *
 * `role="status"` because it appears in response to a press — the pattern the budgets form
 * already sets for a line that shows up mid-interaction. `aria-busy` on the button says
 * that it is working; only this says for how long.
 */
export function GenerationWait({ busy }: { busy: boolean }) {
  if (!busy) return null
  return (
    <p role="status" className="text-muted-foreground text-xs">
      This can take up to a minute and a half.
    </p>
  )
}
