# UX review

A walk through the whole app one design principle at a time, started 2026-09-11. Each pass
takes one lens, usually a pair of related principles, and the passes run in an order that keeps
a later pass from redoing an earlier one: structure, then layout, then interaction, then feel.
This file is the working record: the order, the flow tiers that set each pass's depth, and each
pass's findings as they land.

The review targets the **local build**, which is what gets deployed next. The deployed server is
the daily driver until then.

## How a pass runs

1. Walk every screen and dialog in the inventory at the end of this file, at phone width
   (393 px) and desktop width (1366 px), in light and dark. These are the widths the layout
   specs already sweep.
2. Let the Pass 0 tiers set the depth: daily screens get every state, weekly screens their main
   path, rare screens a skim.
3. Keep to one lens. Anything noticed for another pass is noted under that pass, not fixed.
4. Log findings during the walk and fix nothing yet. Each pass ends the usual way: findings as a
   plan, approval, test-first changes, verification, a commit.
5. Where a check can be measured, turn it into a test, the way the layout sweep guards
   horizontal overflow, so a fix stays fixed.
6. Throughout, Occam's razor is the stance: remove what does not earn its place.

## The passes

| #   | Phase       | Lens                              | Principles                            | Size   | Status          |
| --- | ----------- | --------------------------------- | ------------------------------------- | ------ | --------------- |
| 0   | Setup       | Rank the flows                    | Pareto principle                      | Light  | Done 2026-09-11 |
| 1   | Structure   | Navigation and menus              | Jakob's law + Hick's law              | Medium | Not started     |
| 2   | Structure   | What each screen asks of the user | Tesler's law + progressive disclosure | Heavy  | Not started     |
| 3   | Layout      | Sections and their order          | Chunking + serial position effect     | Medium | Not started     |
| 4   | Layout      | Visible grouping                  | Proximity + uniform connectedness     | Medium | Not started     |
| 5   | Layout      | One thing stands out              | Von Restorff effect + Prägnanz        | Medium | Not started     |
| 6   | Interaction | Reach                             | Fitts's law                           | Medium | Not started     |
| 7   | Interaction | Input                             | Postel's law + defaults               | Medium | Not started     |
| 8   | Interaction | Mistakes                          | Error prevention + error recovery     | Medium | Not started     |
| 9   | Feel        | Speed and feedback                | Doherty threshold                     | Light  | Not started     |
| 10  | Feel        | Progress and endings              | Goal-gradient effect + peak-end rule  | Light  | Not started     |

Sizes: **Light** is a handful of screens, or measuring before judging. **Medium** is every
screen once. **Heavy** is every screen and dialog, field by field.

Left out, with reasons: Parkinson's law, a satire of bureaucracy rather than evidence, whose ask
is covered by Passes 6, 7 and 9. The Zeigarnik effect's memory claim, which failed a 2025
meta-analysis; its resumption half is in Pass 10. Occam's razor, the stance for every pass.
"Minimize target distance", the distance half of Fitts's law, in Pass 6. The "law of
simplicity", another name for Prägnanz, in Pass 5; its description, sensible defaults, is in
Pass 7.

## Pass 0: flow tiers

**Evidence.** Read-only counts from the local database, matched against the commit history.

- The local database is mostly a record of building and testing. Its busiest days are the days
  features were built: 22 transactions and 8 categories on the day monthly budgets shipped, 58
  AI proposals during the companion work.
- Tasks are the exception: created or completed on 8 of the 9 days from 2026-09-01 to
  2026-09-09, including two days with no building.
- Never used on this database: repeating tasks and transactions, running a routine, saved
  meals, and editing an event or a transaction.
- From the user: food is logged every day; transactions are entered as they happen; the
  calendar is opened weekly, or when an event needs adding; weight tracking gets little use.

**Tiers.** A screen takes the tier of its most frequent flow, so the Meals page is daily even
though macro targets and copy a day on it are rare.

| Tier   | Flows                                                                                                                                                                                                                  | Screens                                                                                                                       | Dialogs                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Daily  | Capture and complete tasks; read the dashboard; log a habit; log food, water and weight; add a transaction as it happens                                                                                               | `/`, `/activity`, `/activity/habits`, `/meals`, `/budget`, and the sidebar, phone header, tab bar, command palette and toasts | Task, Log food, transaction                                                                                             |
| Weekly | The weekly review and its AI summary; goals and planning them with AI; the calendar, and adding an event when one comes up; budgets and trends; reading transactions or scanning a receipt with AI; saved meals; lists | `/review`, `/goals`, `/calendar`, `/budget/budgets`, `/budget/trends`, `/activity/lists`                                      | New goal, goal editor, plan a goal, plan review, event, saved meals, saved meal editor                                  |
| Rare   | Routines and repeating rules; categories; macro targets, the food library, copy a day, the barcode scanner; all of settings; sign in                                                                                   | `/activity/routines`, `/activity/repeating`, `/budget/categories`, the eight `/settings` pages, `/login`                      | Routine, routine item, run a routine, habit, delete goal, calendars, food library, copy a day, targets, barcode scanner |

Saved meals count as weekly for now because they are new; they move to daily if they become
how food gets logged.

**Depth per tier.**

- **Daily**: every state (empty, loading, filled, error), every control, both widths, both
  themes. 5 of the 23 screens and 3 of the 20 dialogs.
- **Weekly**: the main path and its empty state, both widths, both themes.
- **Rare**: one walk at each width; other states only where something looks wrong.

## Notes for later passes

What is known going in, plus anything an earlier pass logged. **Keep** marks something done well;
**Look at** marks a candidate for that pass's findings.

### Pass 1: navigation and menus

- Look at: the phone tab bar holds seven destinations. iOS tab bars and Android's bottom
  navigation stop at five, and each item gets a seventh of the width with very small labels.
- Keep: Meals' secondary actions live in one named menu; Activity and Budget are strips of
  pages, so each page carries one job.
- Keep (Pass 0): every flow has an entry point on a phone; none is desktop-only.

### Pass 2: what each screen asks of the user

- Keep: carbs derived from the other macros when balancing is on; tax spread across receipt
  rows; plain-language quick add; the food dialog's extra nutrients behind "More nutrition".
- Look at: the meals page stacks the macro summary, water, weight, the trend chart, quick add,
  saved meals and recent foods above the day's log.

### Pass 3: sections and their order

- Keep: the sidebar and tab bar open with Dashboard and close with Review; settings is split
  into seven pages by subject.
- Look at: the meals page puts its main content, the day's log, below seven other blocks.

### Pass 4: visible grouping

- Keep: dashboard cards group by container, each with a real heading.

### Pass 5: one thing stands out

- Look at: on `/budget`, "Read them" is an outline button and "Read the receipt" a filled one —
  two panels with the same role and different weight.
- Keep: pages lead with one filled action, such as Log food on Meals.

### Pass 6: reach

- Look at: the dashboard's fold chevrons are about 24 px square, exactly the WCAG 2.2 AA
  minimum (24 × 24 CSS px; comfortable is 44 pt on iOS, 48 dp on Android).
- Look at: ADR-0016 records the stat tiles' link moving from the whole tile to a small arrow
  icon, which it calls a real regression in click target.
- Look at: list rows use small icon buttons for edit and delete.
- Look at: on a phone, page actions such as Log food sit in the top corner, the hardest reach.

### Pass 7: input

- Keep: the quick-add bars read plain language, dates included, and the meals bar keeps its
  text when it cannot parse it; a new transaction's date starts at today, or at the first of
  the month being viewed.
- Look at: amounts are number inputs, which cannot take a pasted "$1,234.50".

### Pass 8: mistakes

- Keep: undo toasts after deletes across the app; confirmation before deletes that take other
  data with them, such as a category and its budgets.
- Look at: applying an AI proposal creates its rows with no undo.

### Pass 9: speed and feedback

- Keep: dashboard folds update optimistically; the meals quick-add bar clears at once; route
  changes show loading skeletons.
- Look at: an AI request can run for up to 90 seconds with only "Reading…" on its button.
- Measure on a production build, never the dev server. Targets: Interaction to Next Paint of
  200 ms or less; Doherty's original threshold was 400 ms.

### Pass 10: progress and endings

- Keep: macro bars, habit meters, goal momentum and the budget's month bar; a pending AI
  proposal survives a reload.
- Look at: applying an AI proposal ends in silence — the panel closes and the rows appear
  without a word.
- Look at (Pass 0, weak): in testing, AI goal plans were discarded about twice as often as they
  were applied (24 to 11). Test data, so a hint rather than a finding.

## Screens and dialogs

| Section    | Screens                                                                                                                                                    | Dialogs                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Everywhere | Sidebar, phone header, phone tab bar, command palette and quick capture, toasts, loading skeletons, the offline page                                       | –                                                                                            |
| Dashboard  | `/`                                                                                                                                                        | –                                                                                            |
| Activity   | `/activity`, `/activity/habits`, `/activity/routines`, `/activity/lists`, `/activity/repeating`                                                            | Task, habit, routine, routine item, run a routine                                            |
| Goals      | `/goals`                                                                                                                                                   | New goal, goal editor, plan a goal, plan review, delete goal                                 |
| Calendar   | `/calendar`                                                                                                                                                | Event, calendars                                                                             |
| Budget     | `/budget`, `/budget/budgets`, `/budget/categories`, `/budget/trends`                                                                                       | Transaction                                                                                  |
| Meals      | `/meals`                                                                                                                                                   | Log food, food library, saved meals, saved meal editor, copy a day, targets, barcode scanner |
| Review     | `/review`                                                                                                                                                  | –                                                                                            |
| Settings   | `/settings`, `/settings/account`, `/settings/security`, `/settings/appearance`, `/settings/region`, `/settings/defaults`, `/settings/ai`, `/settings/data` | –                                                                                            |
| Sign in    | `/login`                                                                                                                                                   | –                                                                                            |
