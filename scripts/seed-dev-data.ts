import "dotenv/config"
import { createHash } from "node:crypto"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq, inArray } from "drizzle-orm"
import { Pool } from "pg"

import { users } from "../src/db/schema"
import { addDays, dowOf, todayInZone, weekRange } from "../src/lib/date"
import { budgets, categories, transactions } from "../src/modules/budget/schema"
import { calendars, events } from "../src/modules/calendar/schema"
import { goals, milestones } from "../src/modules/goals/schema"
import { habitEntries, habits } from "../src/modules/habits/schema"
import {
  bodyWeights,
  foods,
  mealEntries,
  waterLogs,
} from "../src/modules/meals/schema"
import { userPreferences } from "../src/modules/preferences/schema"
import { lists, subtasks, tasks } from "../src/modules/todos/schema"

/**
 * Fills a DEVELOPMENT database with a realistic week of data, so every screen has
 * something to show without hand-entering it.
 *
 * Two properties make this safe to run against a database that already has real data
 * in it, which the dev one does:
 *
 *   1. **Every row it writes gets a deterministic id** (`seedId`, a UUIDv5 over a fixed
 *      namespace). Nothing else in the database can collide with one, so the script
 *      never has to guess which rows are its own — it can derive them.
 *   2. **It therefore deletes only what it wrote.** A run clears its previous rows by
 *      those ids and re-inserts, which makes it idempotent; `--clean` does the clearing
 *      half and stops. Hand-entered data is never read, updated or removed.
 *
 * Dates are all relative to today in the account's own zone, and the week is bounded by
 * the account's own `weekStartsOn`, so the fixture stays current however long it sits
 * and matches whatever Settings says.
 *
 *   pnpm db:seed:dev            seed (replacing any previous seed)
 *   pnpm db:seed:dev --clean    remove the seeded rows, leaving everything else
 */

const NAMESPACE = "winnow-dev-seed/v1"

/** A stable UUID for a seed row, derived from its key. Same key, same id, forever. */
function seedId(key: string): string {
  const h = createHash("sha1").update(`${NAMESPACE}:${key}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = h.subarray(0, 16).toString("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/**
 * The instant at which a given wall-clock time occurs in a zone.
 *
 * Guess the time as UTC, ask the zone what wall-clock that instant reads as, and
 * subtract the difference. Correct across DST except inside a transition's ambiguous
 * hour, which no fixture needs to care about.
 */
function instantAt(
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00Z`)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess)
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  )
  return new Date(guess.getTime() - (asUtc - guess.getTime()))
}

/** Weekday bitmask (bit i = weekday i, 0=Sun) for the calendar/todos recurrence rules. */
const mask = (...days: number[]) => days.reduce((m, d) => m | (1 << d), 0)

const dollars = (amount: number) => Math.round(amount * 100)

/**
 * Refuse to touch anything but a local database.
 *
 * The dev and production databases are both named `winnow` — production's just lives on
 * the compose network's `postgres` host instead of this machine. That makes the two
 * connection strings differ by one word, and this repo has already lost real data once to
 * a test harness pointed at the wrong one (docs/HANDOFF.md, T12g). A host check is the
 * cheapest thing that makes the difference impossible to miss.
 */
function assertLocal(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL is not set.")
  const host = new URL(url).hostname
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${host}", not this machine.
` + "This script is for a development database only.",
    )
  }
}

async function main() {
  const clean = process.argv.includes("--clean")
  assertLocal(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)

  const [user] = await db.select().from(users).limit(1)
  if (!user) {
    throw new Error(
      "No user in this database. Run `pnpm db:seed` first to create the account.",
    )
  }
  const userId = user.id

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
  const timeZone = prefs?.timeZone ?? "America/Chicago"
  const weekStartsOn = prefs?.weekStartsOn ?? 0

  const today = todayInZone(new Date(), timeZone)
  const week = weekRange(today, weekStartsOn)
  // Days of the current week that have actually happened, oldest first. The weekly
  // review judges the week on exactly these, so the fixture is built against them.
  const elapsed: string[] = []
  for (let d = week.start; d <= today; d = addDays(d, 1)) elapsed.push(d)

  const day = (n: number) => addDays(today, n)
  const month = today.slice(0, 7)
  const monthStart = `${month}-01`
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`

  // ---------------------------------------------------------------- calendars
  // Reuse the real calendars if they exist — the fixture should look like this
  // account's own data, not a parallel set of duplicates.
  const existingCalendars = await db
    .select()
    .from(calendars)
    .where(eq(calendars.userId, userId))
  const personalCal =
    existingCalendars.find((c) => /personal/i.test(c.name)) ??
    existingCalendars[0]
  const workCal =
    existingCalendars.find((c) => /work/i.test(c.name)) ?? personalCal

  // ------------------------------------------------------------------- lists
  const listRows = [
    { id: seedId("list:home"), userId, name: "Home", sortOrder: 0 },
    { id: seedId("list:work"), userId, name: "Work", sortOrder: 1 },
  ]
  const [homeList, workList] = listRows

  // ------------------------------------------------------------------- tasks
  const at = (dateStr: string, hour: number, minute = 0) =>
    instantAt(dateStr, hour, minute, timeZone)

  const taskRows = [
    // Overdue — the Slate's first section.
    {
      key: "renew-rego",
      title: "Renew the car registration",
      dueDate: day(-3),
      priority: "high" as const,
      listId: homeList.id,
    },
    {
      key: "landlord",
      title: "Reply to the landlord about the lease",
      dueDate: day(-1),
      priority: "medium" as const,
      listId: homeList.id,
    },
    // Due today.
    {
      key: "prescription",
      title: "Pick up the prescription",
      dueDate: today,
      priority: "high" as const,
      listId: homeList.id,
    },
    {
      key: "q3-summary",
      title: "Draft the Q3 summary",
      dueDate: today,
      priority: "medium" as const,
      listId: workList.id,
      notes: "Numbers are in the shared sheet; intro needs a rewrite.",
    },
    {
      key: "plants",
      title: "Water the plants",
      dueDate: today,
      priority: "low" as const,
      listId: homeList.id,
    },
    // Upcoming.
    {
      key: "dentist-forms",
      title: "Fill in the dentist paperwork",
      dueDate: day(1),
      priority: "medium" as const,
      listId: homeList.id,
    },
    {
      key: "flights",
      title: "Book the October flights",
      dueDate: day(3),
      priority: "medium" as const,
      listId: homeList.id,
    },
    {
      key: "taxes",
      title: "Pay the quarterly taxes",
      dueDate: day(6),
      priority: "high" as const,
      listId: workList.id,
    },
    // Someday — no due date.
    {
      key: "pg-book",
      title: "Read the Postgres internals book",
      dueDate: null,
      priority: "low" as const,
      listId: null,
    },
  ].map((t) => ({
    id: seedId(`task:${t.key}`),
    userId,
    listId: t.listId,
    title: t.title,
    notes: "notes" in t ? t.notes : null,
    dueDate: t.dueDate,
    priority: t.priority,
    status: "open" as const,
    createdAt: at(day(-7), 9),
  }))

  // Completed. The two ticked TODAY are the ones that must stay on the dashboard;
  // yesterday's must not.
  const doneRows = [
    { key: "walk", title: "Morning walk", on: today, hour: 7, minute: 15 },
    { key: "inbox", title: "Get the inbox to zero", on: today, hour: 9 },
    { key: "groceries", title: "Grocery shop", on: day(-1), hour: 17 },
    ...elapsed.slice(0, -1).map((d, i) => ({
      key: `wk-${i}`,
      title: [
        "Take the bins out",
        "Call the bank about the statement",
        "Fix the leaking tap",
        "Send the invoice",
        "Back up the laptop",
        "Sort the recycling",
      ][i % 6],
      on: d,
      hour: 10 + (i % 6),
      minute: 0,
    })),
  ].map((t) => ({
    id: seedId(`task:done:${t.key}`),
    userId,
    listId: null,
    title: t.title,
    notes: null,
    dueDate: t.on,
    priority: "medium" as const,
    status: "done" as const,
    completedAt: at(t.on, t.hour, "minute" in t ? (t.minute ?? 0) : 0),
    createdAt: at(t.on, 6),
  }))

  const subtaskRows = [
    { key: "a", title: "Pull the numbers", done: true },
    { key: "b", title: "Write the intro", done: true },
    { key: "c", title: "Send it round for review", done: false },
  ].map((s, i) => ({
    id: seedId(`subtask:${s.key}`),
    userId,
    taskId: seedId("task:q3-summary"),
    title: s.title,
    done: s.done,
    sortOrder: i,
  }))

  // ------------------------------------------------------------------ budget
  const categoryRows = [
    { key: "salary", name: "Salary", kind: "income" as const },
    { key: "freelance", name: "Freelance", kind: "income" as const },
    { key: "rent", name: "Rent", kind: "expense" as const },
    { key: "groceries", name: "Groceries", kind: "expense" as const },
    { key: "dining", name: "Dining out", kind: "expense" as const },
    { key: "transport", name: "Transport", kind: "expense" as const },
    { key: "utilities", name: "Utilities", kind: "expense" as const },
    { key: "subs", name: "Subscriptions", kind: "expense" as const },
  ].map((c) => ({ id: seedId(`category:${c.key}`), userId, ...c }))

  const cat = (key: string) => seedId(`category:${key}`)

  const spend = [
    // This week — so the weekly review's Money card has something to judge.
    {
      key: "t1",
      d: day(0),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 62.4,
    },
    { key: "t2", d: day(0), payee: "Blue Bottle", cat: "dining", amt: 6.75 },
    { key: "t3", d: day(-1), payee: "Metro Card", cat: "transport", amt: 30 },
    { key: "t4", d: day(-1), payee: "Thai Basil", cat: "dining", amt: 41.2 },
    {
      key: "t5",
      d: day(-2),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 88.15,
    },
    { key: "t6", d: day(-3), payee: "Shell", cat: "transport", amt: 52.8 },
    { key: "t7", d: day(-4), payee: "Netflix", cat: "subs", amt: 15.49 },
    {
      key: "t8",
      d: day(-5),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 47.3,
    },
    // Earlier this month.
    {
      key: "t9",
      d: day(-9),
      payee: "City Power",
      cat: "utilities",
      amt: 143.22,
    },
    {
      key: "t10",
      d: day(-11),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 103.6,
    },
    { key: "t11", d: day(-12), payee: "Spotify", cat: "subs", amt: 11.99 },
    {
      key: "t12",
      d: day(-14),
      payee: "Pizzeria Uno",
      cat: "dining",
      amt: 34.5,
    },
    { key: "t13", d: day(-16), payee: "Metro Card", cat: "transport", amt: 30 },
    {
      key: "t14",
      d: day(-18),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 71.05,
    },
    {
      key: "t15",
      d: day(-21),
      payee: "City Water",
      cat: "utilities",
      amt: 48.9,
    },
    {
      key: "t16",
      d: day(-24),
      payee: "Corner Grocer",
      cat: "groceries",
      amt: 95.4,
    },
    { key: "t17", d: day(-26), payee: "Ramen Bar", cat: "dining", amt: 28.0 },
    { key: "t18", d: day(-28), payee: "Shell", cat: "transport", amt: 49.6 },
  ].map((t) => ({
    id: seedId(`txn:${t.key}`),
    userId,
    categoryId: cat(t.cat),
    amountCents: dollars(t.amt),
    type: "expense" as const,
    date: t.d,
    payee: t.payee,
    description: null,
  }))

  const income = [
    {
      key: "i1",
      d: `${month}-01`,
      payee: "Acme Corp",
      cat: "salary",
      amt: 4200,
    },
    {
      key: "i2",
      d: `${month}-15`,
      payee: "Acme Corp",
      cat: "salary",
      amt: 4200,
    },
    {
      key: "i3",
      d: day(-6),
      payee: "Side project",
      cat: "freelance",
      amt: 850,
    },
    {
      key: "i4",
      d: `${lastMonthStart.slice(0, 7)}-15`,
      payee: "Acme Corp",
      cat: "salary",
      amt: 4200,
    },
  ]
    // A payday later in the month hasn't happened yet — don't post the future.
    .filter((t) => t.d <= today)
    .map((t) => ({
      id: seedId(`txn:${t.key}`),
      userId,
      categoryId: cat(t.cat),
      amountCents: dollars(t.amt),
      type: "income" as const,
      date: t.d,
      payee: t.payee,
      description: null,
    }))

  const rentRow = {
    id: seedId("txn:rent"),
    userId,
    categoryId: cat("rent"),
    amountCents: dollars(1750),
    type: "expense" as const,
    date: monthStart,
    payee: "Landlord",
    description: null,
  }

  const budgetRows = [
    { key: "groceries", amt: 600 },
    { key: "dining", amt: 200 },
    { key: "transport", amt: 150 },
    { key: "utilities", amt: 220 },
    { key: "subs", amt: 60 },
  ].map((b) => ({
    id: seedId(`budget:${b.key}`),
    userId,
    categoryId: cat(b.key),
    periodMonth: monthStart,
    amountCents: dollars(b.amt),
  }))

  // ---------------------------------------------------------------- calendar
  const eventRows = personalCal
    ? [
        {
          key: "standup",
          title: "Standup",
          cal: workCal.id,
          d: today,
          from: [9, 0],
          to: [9, 15],
          freq: "weekly" as const,
          weekdays: mask(1, 2, 3, 4, 5),
        },
        {
          key: "lunch",
          title: "Lunch with Dana",
          cal: personalCal.id,
          d: today,
          from: [12, 30],
          to: [13, 30],
        },
        {
          key: "jj",
          title: "Jiu Jitsu class",
          cal: personalCal.id,
          d: today,
          from: [18, 0],
          to: [19, 30],
        },
        {
          key: "review",
          title: "Design review",
          cal: workCal.id,
          d: day(1),
          from: [14, 0],
          to: [15, 0],
        },
        {
          key: "market",
          title: "Farmers market",
          cal: personalCal.id,
          d: day(1),
          from: [0, 0],
          to: [23, 59],
          allDay: true,
        },
        {
          key: "dentist",
          title: "Dentist",
          cal: personalCal.id,
          d: day(2),
          from: [10, 0],
          to: [11, 0],
          highlighted: true,
        },
        {
          key: "flight",
          title: "Flight to Denver",
          cal: personalCal.id,
          d: day(5),
          from: [6, 30],
          to: [8, 0],
          highlighted: true,
        },
        {
          key: "one-on-one",
          title: "1:1 with Priya",
          cal: workCal.id,
          d: day(-1),
          from: [16, 0],
          to: [16, 30],
        },
      ].map((e) => ({
        id: seedId(`event:${e.key}`),
        userId,
        calendarId: e.cal,
        title: e.title,
        notes: null,
        startAt: at(e.d, e.from[0], e.from[1]),
        endAt: at(e.d, e.to[0], e.to[1]),
        allDay: "allDay" in e ? Boolean(e.allDay) : false,
        highlighted: "highlighted" in e ? Boolean(e.highlighted) : false,
        recurrenceFreq: "freq" in e ? e.freq : ("none" as const),
        recurrenceWeekdays: "weekdays" in e ? (e.weekdays ?? 0) : 0,
      }))
    : []

  // ------------------------------------------------------------------- meals
  const foodSource = [
    {
      key: "oats",
      name: "Rolled oats",
      serving: "1/2 cup dry",
      kcal: 190,
      p: 7,
      c: 33,
      f: 3.5,
      fib: 5,
      sug: 1,
      sat: 0.6,
      sod: 0,
    },
    {
      key: "eggs",
      name: "Egg, large",
      serving: "1 egg",
      kcal: 72,
      p: 6.3,
      c: 0.4,
      f: 4.8,
      fib: 0,
      sug: 0.2,
      sat: 1.6,
      sod: 71,
    },
    {
      key: "chicken",
      name: "Chicken breast",
      serving: "4 oz",
      kcal: 187,
      p: 35,
      c: 0,
      f: 4,
      fib: 0,
      sug: 0,
      sat: 1.1,
      sod: 84,
    },
    {
      key: "rice",
      name: "Brown rice, cooked",
      serving: "1 cup",
      kcal: 218,
      p: 4.5,
      c: 46,
      f: 1.6,
      fib: 3.5,
      sug: 0.7,
      sat: 0.4,
      sod: 10,
    },
    {
      key: "yogurt",
      name: "Greek yoghurt, plain",
      serving: "170 g",
      kcal: 100,
      p: 17,
      c: 6,
      f: 0.7,
      fib: 0,
      sug: 6,
      sat: 0.2,
      sod: 61,
    },
    {
      key: "banana",
      name: "Banana",
      serving: "1 medium",
      kcal: 105,
      p: 1.3,
      c: 27,
      f: 0.4,
      fib: 3.1,
      sug: 14,
      sat: 0.1,
      sod: 1,
    },
    {
      key: "salmon",
      name: "Salmon fillet",
      serving: "5 oz",
      kcal: 291,
      p: 39,
      c: 0,
      f: 14,
      fib: 0,
      sug: 0,
      sat: 3.1,
      sod: 103,
    },
    {
      key: "broccoli",
      name: "Broccoli, steamed",
      serving: "1 cup",
      kcal: 55,
      p: 3.7,
      c: 11,
      f: 0.6,
      fib: 5.1,
      sug: 2.2,
      sat: 0.1,
      sod: 64,
    },
    {
      key: "almonds",
      name: "Almonds",
      serving: "1 oz",
      kcal: 164,
      p: 6,
      c: 6.1,
      f: 14,
      fib: 3.5,
      sug: 1.2,
      sat: 1.1,
      sod: 0,
    },
    {
      key: "bread",
      name: "Wholegrain bread",
      serving: "1 slice",
      kcal: 81,
      p: 4,
      c: 13.8,
      f: 1.1,
      fib: 1.9,
      sug: 1.4,
      sat: 0.2,
      sod: 144,
    },
    {
      key: "pb",
      name: "Peanut butter",
      serving: "2 tbsp",
      kcal: 188,
      p: 8,
      c: 6.9,
      f: 16,
      fib: 1.9,
      sug: 3,
      sat: 3.3,
      sod: 152,
    },
    {
      key: "coffee",
      name: "Coffee with milk",
      serving: "1 mug",
      kcal: 32,
      p: 1.7,
      c: 2.6,
      f: 1.7,
      fib: 0,
      sug: 2.6,
      sat: 1.1,
      sod: 24,
    },
  ]
  const foodRows = foodSource.map((f) => ({
    id: seedId(`food:${f.key}`),
    userId,
    name: f.name,
    servingLabel: f.serving,
    calories: f.kcal,
    proteinG: f.p,
    carbsG: f.c,
    fatG: f.f,
    fiberG: f.fib,
    sugarG: f.sug,
    satFatG: f.sat,
    sodiumMg: f.sod,
  }))

  const foodByKey = new Map(foodSource.map((f, i) => [f.key, foodRows[i]]))

  // Deliberately NOT every elapsed day: the weekly review reads "logged on N of the
  // days that have happened", and a fixture where N equals the elapsed count would
  // hide whether that denominator is right.
  const loggedDays = elapsed.filter((_, i) => i % 3 !== 2)

  const mealPlan: Array<[string, string, number]> = [
    ["breakfast", "oats", 1],
    ["breakfast", "coffee", 1],
    ["lunch", "chicken", 1],
    ["lunch", "rice", 1],
    ["lunch", "broccoli", 1],
    ["snack", "almonds", 1],
    ["dinner", "salmon", 1],
    ["dinner", "broccoli", 1],
  ]

  const mealRows = loggedDays.flatMap((d, di) =>
    mealPlan
      // Vary the day a little so the totals aren't identical across the week.
      .filter((_, i) => !(di % 2 === 1 && i === 5))
      .map(([mealType, foodKey, servings], i) => {
        const f = foodByKey.get(foodKey)!
        return {
          id: seedId(`meal:${d}:${i}`),
          userId,
          foodId: f.id,
          date: d,
          mealType: mealType as "breakfast" | "lunch" | "dinner" | "snack",
          servings,
          name: f.name,
          servingLabel: f.servingLabel,
          calories: f.calories,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          fiberG: f.fiberG,
          sugarG: f.sugarG,
          satFatG: f.satFatG,
          sodiumMg: f.sodiumMg,
        }
      }),
  )

  const waterRows = loggedDays.flatMap((d, di) =>
    [16, 16, 8].slice(0, di % 2 === 0 ? 3 : 2).map((oz, i) => ({
      id: seedId(`water:${d}:${i}`),
      userId,
      date: d,
      amountFlOz: oz,
    })),
  )

  const weightRows = [0, 3, 6, 10, 14, 18, 21]
    .map((back, i) => ({
      id: seedId(`weight:${i}`),
      userId,
      date: day(-back),
      weightLb: 196.4 + back * 0.32,
    }))
    .filter((w) => w.date <= today)

  // ------------------------------------------------------------------- goals
  // Three deliberate shapes for the momentum rule: one moving, one brand new (must
  // NOT read stalled inside its grace week), one genuinely idle (must).
  const goalRows = [
    {
      id: seedId("goal:books"),
      userId,
      title: "Read 24 books this year",
      notes: "Fiction counts.",
      targetValue: 24,
      currentValue: 9,
      unit: "books",
      targetDate: `${today.slice(0, 4)}-12-31`,
      sortOrder: 0,
      createdAt: at(day(-60), 9),
    },
    {
      id: seedId("goal:swim"),
      userId,
      title: "Learn freestyle properly",
      notes: "Created today — should not read as stalled yet.",
      targetValue: null,
      currentValue: null,
      unit: null,
      targetDate: day(90),
      sortOrder: 1,
      createdAt: at(today, 8),
    },
    {
      id: seedId("goal:garage"),
      userId,
      title: "Declutter the garage",
      notes: "Untouched for weeks — this one has earned 'stalled'.",
      targetValue: null,
      currentValue: null,
      unit: null,
      targetDate: day(45),
      sortOrder: 2,
      createdAt: at(day(-30), 9),
    },
  ]

  const milestoneRows = [
    // Movement this week — feeds the weekly review's Goals card.
    {
      key: "b1",
      goal: "goal:books",
      title: "Finish 'Piranesi'",
      done: true,
      at: elapsed[1] ?? today,
    },
    {
      key: "b2",
      goal: "goal:books",
      title: "Start 'The Overstory'",
      done: true,
      at: elapsed[Math.min(3, elapsed.length - 1)],
    },
    {
      key: "b3",
      goal: "goal:books",
      title: "Pick October's book",
      done: false,
      at: null,
    },
    {
      key: "g1",
      goal: "goal:garage",
      title: "Hire a skip",
      done: true,
      at: day(-25),
    },
    {
      key: "g2",
      goal: "goal:garage",
      title: "Clear the left wall",
      done: false,
      at: null,
    },
    {
      key: "g3",
      goal: "goal:garage",
      title: "Sell the old bikes",
      done: false,
      at: null,
    },
  ].map((m, i) => ({
    id: seedId(`milestone:${m.key}`),
    userId,
    goalId: seedId(m.goal),
    title: m.title,
    done: m.done,
    dueDate: null,
    sortOrder: i,
    completedAt: m.at ? at(m.at, 20) : null,
  }))

  // ------------------------------------------------------------------ habits
  const habitRows = [
    {
      id: seedId("habit:jj"),
      userId,
      title: "Jiu Jitsu classes",
      goalId: null,
      period: "week" as const,
      targetCount: 3,
      unit: null,
      targetAmount: null,
      startDate: day(-45),
      sortOrder: 0,
    },
    {
      id: seedId("habit:pages"),
      userId,
      title: "Read 20 pages",
      goalId: seedId("goal:books"),
      period: "day" as const,
      targetCount: 1,
      unit: "pages",
      targetAmount: 20,
      startDate: day(-45),
      sortOrder: 1,
    },
  ]

  const habitEntryRows = [
    // Two of three classes so far this week — under target, on purpose.
    ...elapsed
      .filter((_, i) => i === 1 || i === 3)
      .map((d, i) => ({
        id: seedId(`hentry:jj:${i}`),
        userId,
        habitId: seedId("habit:jj"),
        onDate: d,
        amount: null,
      })),
    // A near-daily reading streak.
    ...elapsed
      .filter((_, i) => i % 4 !== 3)
      .map((d, i) => ({
        id: seedId(`hentry:pages:${i}`),
        userId,
        habitId: seedId("habit:pages"),
        onDate: d,
        amount: 20 + (i % 3) * 5,
      })),
  ]

  // ------------------------------------------------------------------- write
  // Children before parents. Every id here was produced by `seedId`, so a delete can
  // never reach a row this script did not create. `inArray` with an empty list is not
  // valid SQL, so each step is skipped when it has nothing to remove.
  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id)

  const wipe: Array<[string, string[], (v: string[]) => Promise<unknown>]> = [
    [
      "subtasks",
      ids(subtaskRows),
      (v) => db.delete(subtasks).where(inArray(subtasks.id, v)),
    ],
    [
      "tasks",
      ids([...taskRows, ...doneRows]),
      (v) => db.delete(tasks).where(inArray(tasks.id, v)),
    ],
    [
      "lists",
      ids(listRows),
      (v) => db.delete(lists).where(inArray(lists.id, v)),
    ],
    [
      "habit_entries",
      ids(habitEntryRows),
      (v) => db.delete(habitEntries).where(inArray(habitEntries.id, v)),
    ],
    [
      "habits",
      ids(habitRows),
      (v) => db.delete(habits).where(inArray(habits.id, v)),
    ],
    [
      "milestones",
      ids(milestoneRows),
      (v) => db.delete(milestones).where(inArray(milestones.id, v)),
    ],
    [
      "goals",
      ids(goalRows),
      (v) => db.delete(goals).where(inArray(goals.id, v)),
    ],
    [
      "meal_entries",
      ids(mealRows),
      (v) => db.delete(mealEntries).where(inArray(mealEntries.id, v)),
    ],
    [
      "foods",
      ids(foodRows),
      (v) => db.delete(foods).where(inArray(foods.id, v)),
    ],
    [
      "water_logs",
      ids(waterRows),
      (v) => db.delete(waterLogs).where(inArray(waterLogs.id, v)),
    ],
    [
      "body_weights",
      ids(weightRows),
      (v) => db.delete(bodyWeights).where(inArray(bodyWeights.id, v)),
    ],
    [
      "budgets",
      ids(budgetRows),
      (v) => db.delete(budgets).where(inArray(budgets.id, v)),
    ],
    [
      "transactions",
      ids([...spend, ...income, rentRow]),
      (v) => db.delete(transactions).where(inArray(transactions.id, v)),
    ],
    [
      "categories",
      ids(categoryRows),
      (v) => db.delete(categories).where(inArray(categories.id, v)),
    ],
    [
      "events",
      ids(eventRows),
      (v) => db.delete(events).where(inArray(events.id, v)),
    ],
  ]

  for (const [, rowIds, run] of wipe) if (rowIds.length) await run(rowIds)

  if (clean) {
    console.log("Removed the seeded rows. Nothing else was touched.")
    await pool.end()
    return
  }

  await db.insert(lists).values(listRows)
  await db.insert(tasks).values([...taskRows, ...doneRows])
  await db.insert(subtasks).values(subtaskRows)
  await db.insert(categories).values(categoryRows)
  await db.insert(transactions).values([...spend, ...income, rentRow])
  await db.insert(budgets).values(budgetRows)
  if (eventRows.length) await db.insert(events).values(eventRows)
  await db.insert(foods).values(foodRows)
  await db.insert(mealEntries).values(mealRows)
  if (waterRows.length) await db.insert(waterLogs).values(waterRows)
  await db.insert(bodyWeights).values(weightRows)
  await db.insert(goals).values(goalRows)
  await db.insert(milestones).values(milestoneRows)
  await db.insert(habits).values(habitRows)
  await db.insert(habitEntries).values(habitEntryRows)

  const dow = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][dowOf(today)]

  console.log(`Seeded ${user.email} (${timeZone})`)
  console.log(`  today          ${today} (${dow})`)
  console.log(
    `  week           ${week.start} to ${week.end} — ${elapsed.length} of 7 days elapsed`,
  )
  console.log(
    `  tasks          ${taskRows.length} open, ${doneRows.length} done (2 ticked today)`,
  )
  console.log(`  subtasks       ${subtaskRows.length}`)
  console.log(`  lists          ${listRows.length}`)
  console.log(`  categories     ${categoryRows.length}`)
  console.log(`  transactions   ${spend.length + income.length + 1}`)
  console.log(`  budgets        ${budgetRows.length}`)
  console.log(
    `  events         ${eventRows.length}${eventRows.length ? "" : " (no calendar found — skipped)"}`,
  )
  console.log(`  foods          ${foodRows.length}`)
  console.log(
    `  meal entries   ${mealRows.length} across ${loggedDays.length} of ${elapsed.length} elapsed days`,
  )
  console.log(`  water logs     ${waterRows.length}`)
  console.log(`  body weights   ${weightRows.length}`)
  console.log(`  goals          ${goalRows.length} (moving / new today / idle)`)
  console.log(`  milestones     ${milestoneRows.length}`)
  console.log(
    `  habits         ${habitRows.length}, ${habitEntryRows.length} entries`,
  )
  console.log(
    `\nRe-run to refresh; \`pnpm db:seed:dev --clean\` to remove exactly these rows.`,
  )

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
