# ADR-0023: Weight Is A Trend To Watch

**Status:** Accepted
**Date:** 2026-09-09
**Extends:** the T4 meals tranche's body-weight design, recorded in `ARCHITECTURE.md` §3
(no ADR of its own)

## Context

T4 gave `/meals` a weigh-in card and a chart. The card wrote one row per day; the chart
bucketed those rows into seven-day windows, kept the latest reading in each, and drew a
line once two windows held one. It sat at the foot of the page, under the day's meal log,
and it was the only thing in the app that read the table. Nothing on the dashboard, in the
weekly review, in the digest or in the companion knew a weight had been logged.

The user's report: several weights entered, and "seemingly nothing was ever done with
them". That is an accurate description. Three weigh-ins inside a week collapsed to one
point and a stub; a second entry on the same day silently replaced the first; and the one
output was somewhere nobody scrolled to. A number with no consequence.

The brainstorm settled what weight is FOR here: a trend to watch. Not a goal with milestones
and momentum, not a lever on the calorie target. A number beside it saying how far a goal
weight is, and a way to turn the whole thing off.

## Decision

**The trend is the number.** `weightTrend` runs an exponentially smoothed line through the
weigh-ins in date order — time-aware, with a ten-day time constant, so a daily habit gets
the classic Hacker's Diet step of about a tenth per reading and a weekly one takes a larger
step instead of lagging for months. Two weigh-ins on any two days make a trend. Its weekly
rate is read off the last four weeks of the line, once two weeks separate the readings it
is read between. Day-to-day weight is water and food; the line is the part worth watching,
and every readout quotes it rather than the scale.

**One readout, three places.** `weightReadout` produces the latest reading, the trend, the
rate and the goal part; the weigh-in card, the chart's heading and the dashboard's Macros
tile all render that one object, so they cannot disagree. The chart moved from the foot of
`/meals` to directly under the card that feeds it, and draws one point per weigh-in with
the trend through them and the goal as a dashed line.

**A goal weight is a preference, not a goal.** `user_preferences.goal_weight_lb`, typed in
the display unit and stored in pounds like the weigh-ins. It yields "4.6 lb to go" and,
when the trend is moving toward it at a rate worth extrapolating, "about 12 weeks at this
rate". The estimate is omitted rather than invented: no rate yet, a rate away from the
goal, a rate under a tenth of a pound a week, or an answer past two years all leave it out.
Within half a pound reads as "at your goal".

**Tracking is a switch that hides, never deletes.** `user_preferences.track_weight`, on by
default. Off removes the card, the chart and the tile's line, and the pages stop reading
the table; the rows stay, so turning it back on finds the history where it was.

**Capture stays on `/meals`.** No dashboard field, no weigh-in cadence, no habit.

## Consequences

- **The chart's x-axis is per weigh-in, not per calendar day.** A gap of a month between
  two readings is one slot wide. The footnote says so; the trend maths is time-aware even
  though the axis is not. A time-true axis needs gap-aware points in `LineChart`, which is a
  larger change than the question warranted.
- **The line lags a fast change, by design.** After twelve weeks of steady loss and a flat
  month, the rate still reads about a quarter of a pound a week while the line closes the
  gap it built up. The test that pins the recent-window rule says so in its threshold.
- **Migration `0044` is additive** — a defaulted boolean and a nullable real — so it does not
  break a production build made before it, the way `0043`'s rename did. It still has to be
  applied before the next rebuild; it waits on the runbook's port step with `0041`–`0043`.
- **`LineChart` gained two optional props**, `labelStep` and `reference`; nothing that used
  it before changes.
- **`ARCHITECTURE.md` was wrong about units.** It said the app was imperial by decision with
  no units preference; the kg/lb preference and the conversion layer have existed since the
  Region settings page. Corrected in the same tranche.
- **Water is untouched** and in the same input-only state weight was. It was not part of the
  complaint.

## Alternatives considered

- **A goal in the goals module, with its current value read from the trend.** Would have
  inherited progress, an at-risk date, momentum and the planner. The user wanted a trend
  to watch, not a project; the readout is the lighter shape of the same number.
- **Keep the weekly buckets and add the dashboard line.** The buckets ARE the reported
  failure — the shape that turns three weigh-ins into one point — so any amount of
  surfacing them would have surfaced the same nothing.
- **A weigh-in cadence preference and a dashboard prompt.** Declined by the user; the
  trend maths handles any cadence, so nothing needs to know it.
- **An expenditure estimate from intake against the trend.** The adaptive-TDEE idea is real
  arithmetic and fits ADR-0011, but it is only as good as the meal log is complete, and it
  was not what weight was for. Deferred, not rejected.
