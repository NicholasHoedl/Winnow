import "server-only"

import { addDays, todayInZone, weekRange } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { getBudgetSummary, getRangeSummary } from "@/modules/budget/queries"
import { getMilestonesCompletedInRange } from "@/modules/goals/queries"
import {
  getMacroTargetHistory,
  getMealEntriesRange,
} from "@/modules/meals/queries"
import { sumMacros, targetsForDate } from "@/modules/meals/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getCompletedInRange } from "@/modules/todos/queries"

import {
  type ReviewMacroDay,
  type WeeklyReview,
  buildWeeklyReview,
} from "./service"

export type WeekMoney = Awaited<ReturnType<typeof getRangeSummary>>
export type MonthMoney = Awaited<ReturnType<typeof getBudgetSummary>>

export type WeeklyReviewView = {
  review: WeeklyReview
  /** Spend inside the week, with NO budgets — see `getRangeSummary`. */
  weekMoney: WeekMoney
  /**
   * The whole month the week ends in, against that month's budgets. This is the honest
   * counterpart to week spend: budgets are set per calendar month, so the month is the
   * only period a budget figure exists for.
   */
  monthMoney: MonthMoney
  month: string
  currency: string
  /** True when the anchor falls in the week containing today. */
  isCurrentWeek: boolean
}

/**
 * A week's review. `anchorDate` is any date inside the wanted week — the page passes it
 * straight from `?week=`, so stepping back and forward is a link rather than state.
 *
 * Pure orchestration, exactly like `computeDigest`: every source query scopes itself to
 * the session user, and the guard below states that requirement locally rather than
 * leaving it emergent.
 */
export async function getWeeklyReview(
  anchorDate?: string,
): Promise<WeeklyReviewView> {
  await requireUserId()
  const { timeZone, weekStartsOn, currency } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const anchor = anchorDate ?? today
  const { start, end } = weekRange(anchor, weekStartsOn)
  // The month the week ENDS in. A week straddling a boundary belongs to the month it
  // finishes in, which is the one whose budget it is still spending against.
  const month = end.slice(0, 7)

  const [tasksCompleted, milestones, entries, targets, weekMoney, monthMoney] =
    await Promise.all([
      getCompletedInRange(start, end, timeZone),
      getMilestonesCompletedInRange(start, end, timeZone),
      getMealEntriesRange(start, end),
      // Every target period, resolved per day below — NOT one lookup for the week. A
      // week that straddles a target change would otherwise be scored entirely against
      // whichever end happened to be asked for.
      getMacroTargetHistory(),
      getRangeSummary(start, addDays(end, 1)),
      getBudgetSummary(month),
    ])

  const entriesByDate = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date)
    if (list) list.push(entry)
    else entriesByDate.set(entry.date, [entry])
  }

  const macroDays: ReviewMacroDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const dayEntries = entriesByDate.get(date) ?? []
    return {
      date,
      calories: sumMacros(dayEntries).calories,
      targetCalories: targetsForDate(targets, date)?.calories ?? null,
      // A day logged at zero is not the same as a day with nothing logged.
      logged: dayEntries.length > 0,
    }
  })

  return {
    review: buildWeeklyReview({
      weekStart: start,
      weekEnd: end,
      tasksCompleted,
      milestones,
      macroDays,
      money: {
        incomeCents: weekMoney.incomeCents,
        expenseCents: weekMoney.expenseCents,
        netCents: weekMoney.netCents,
      },
    }),
    weekMoney,
    monthMoney,
    month,
    currency,
    isCurrentWeek: today >= start && today <= end,
  }
}
