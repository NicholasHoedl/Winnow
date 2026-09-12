# ADR-0030: The Weight Chart Reads Last On The Meals Page

**Status:** Accepted
**Date:** 2026-09-12
**Amends:** ADR-0023 (the chart "directly under the card that feeds it"). ADR-0027, the
fold, is unchanged.

## Context

The UX review's third pass judged each screen's sections and their order by two principles:
chunking, that content is grouped into a few units under headings that say what they hold,
and the serial position effect, that what comes first on a screen is found and remembered
best, so the first block should be the screen's main job. Pass 0 had ranked the flows: food
is logged every day; weight tracking gets little use.

Measured at 393 × 852, the meals page put the day's log, the thing the page is for, seventh
of seven blocks, 913 px down, below the day nav, the macro summary, water and weight, the
weight trend chart, quick add and the quick picks. The chart sat directly above the log by
ADR-0023's decision: T29 moved it there from the foot of the page so that a weigh-in could
not be logged without the trend being seen. T32 then let it fold (ADR-0027), which the same
decision had made necessary: the chart had become the tallest thing on the page.

## Decision

The weight trend chart renders after the day's log, the last block on the page. Everything
else keeps its order: day nav, macro summary, water and weight, quick add and quick picks,
the log, the chart. The chart still folds through `DashboardCard` under the same preference
key.

ADR-0023's reason for the old placement is met another way: the weigh-in card directly
under the macro summary quotes the trend, the rate and the goal from the same `weightReadout`
object the chart draws, so a weigh-in is still logged with the trend in view. What the chart
adds, the line itself, is a thing to read on the days it is wanted, and a block read
occasionally belongs after the block used every day.

## Consequences

- The day's log starts within the first screen on a phone with the chart out of the way; the
  remaining height above it is the water and weight block, a layout question for a later
  pass.
- A weigh-in is logged with the readout in view, not the chart. Someone reading ADR-0023
  should read this one before moving the chart back.
- An e2e assertion holds the order: the log precedes the "Weight trend" card in document
  order at 393 px.
