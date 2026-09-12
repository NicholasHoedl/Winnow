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
| 1   | Structure   | Navigation and menus              | Jakob's law + Hick's law              | Medium | Done 2026-09-11 |
| 2   | Structure   | What each screen asks of the user | Tesler's law + progressive disclosure | Heavy  | Done 2026-09-11 |
| 3   | Layout      | Sections and their order          | Chunking + serial position effect     | Medium | Done 2026-09-12 |
| 4   | Layout      | Visible grouping                  | Proximity + uniform connectedness     | Medium | Done 2026-09-12 |
| 5   | Layout      | One thing stands out              | Von Restorff effect + Prägnanz        | Medium | Done 2026-09-12 |
| 6   | Interaction | Reach                             | Fitts's law                           | Medium | Done 2026-09-12 |
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

### Pass 1: navigation and menus — done 2026-09-11 (T35, ADR-0029)

Walked every navigation surface at 393 px and 1366 px in both themes, against Material's
navigation bar (three to five destinations) and Apple's tab bar guidance (three to five, the
rest behind More).

Fixed:

- The phone tab bar held seven destinations. It now holds Dashboard, Activity, Budget and
  Meals, and More opens a sheet with Goals, Calendar, Review and Settings; More is lit on
  those pages. Labels grew from 0.65rem to `text-xs`. The desktop sidebar keeps all seven.
- The phone header carried Settings and the theme toggle on every screen. It keeps the brand
  and Search; Settings is in More and the theme is on the Appearance page.
- Section strips wrapped onto two rows on a phone. `PageTabs` draws all three as one row that
  scrolls, with the current page scrolled into view.
- Review's week control was the one date control shaped differently. It now matches Meals and
  Budget, and its title took the display face every other page title has.
- The primary action sat in three places. Goals and Calendar now put it right of the title,
  with the description and the view toggle beneath.
- The palette's create list is ordered most-used first.

Kept: the desktop sidebar; the Meals actions menu; the settings index of described cards; the
keyboard shortcuts (Ctrl+K, `n`, `g` then a letter); every flow reachable on a phone.

### Pass 2: what each screen asks of the user — done 2026-09-11 (T36)

Walked every screen and dialog at 393 px and 1366 px in both themes, field by field on the
daily tier, against Tesler's law (the app derives what it can and fills it in) and progressive
disclosure (a rare control sits one tap away, not on every screen). A map of every form's
fields, defaults and derivations went into the judgment alongside 183 screenshots.

Fixed:

- Log food started every entry at "No meal", though the quick-add bar and saved meals already
  filed entries under the "Quick-added meals go to" preference. The dialog and the quick-pick
  chips follow it now; "No meal" stays pickable. A hand-entered food starts at "1 serving",
  the serving the quick-add parser already assumes, in the dialog and the food library.
- A task that repeated asked for its date twice: choosing a frequency now starts the schedule
  on the due date already typed. The Goal and Event pickers, two full-width selects on every
  new task once the account held one goal or one event, sit behind "Link to a goal or event",
  open when the task already has a link; on a goal-filtered Activity page a new task is
  pre-linked to that goal.
- Routine items hard-coded a medium priority and no list; they take the default priority and
  list that tasks take.
- The Priority select in the task and routine item dialogs showed its raw value, "medium".
- A new transaction opened with an Amount of 0 to select and overtype; it opens empty, and an
  empty submit says "Enter an amount". The category was chosen by hand every time: leaving
  the Payee field now fills the type and category from the last transaction with the same
  payee, never over a category or type already chosen, and the quick-add bar does the same
  when no `#tag` is typed and the sign agrees. Quick-add rows teach the memory through their
  text, so `coffee 4 #food` once makes `coffee 4` categorised after.
- Add event dated every event today, whatever month was on screen; it dates it today when
  today is visible and on the anchor day otherwise, the rule the transaction date already
  follows. The dashboard's Add event and the palette's New event, New habit and New routine
  delivered a page with the same words still to press; each opens its dialog on arrival.

Measured after: at 393 × 852 the New task dialog's Create button sits 85 px above the fold
with the pickers folded and the dialog no longer scrolls; opened, it scrolls 46 px, about
where it was before with one picker showing.

Kept, with reasons: the two AI panels on `/budget` sit below the ledger, so they cost the daily
flow nothing; the log food dialog's hand-entry fields stay visible because a search pick fills
them; an event may have no end, and 09:00 is a fair start; `/activity` lists done tasks under
the open ones by design; the two task entry points on the dashboard and the meals stack are
order and emphasis questions, filed for Passes 3 and 5; carbs derived from the other macros,
tax spread across receipt rows, plain-language quick add and "More nutrition" were already
right.

### Pass 3: sections and their order — done 2026-09-12 (T37, ADR-0030)

Walked every screen at 393 px and 1366 px in light, the daily five in dark, and every dialog
at 393 px, and measured each screen's blocks in order with their heights, against chunking
(content in a few units under headings that say what they hold) and the serial position
effect (the first block is the screen's main job).

Fixed:

- The meals page put the day's log seventh of seven blocks, 913 px down at 393 px, with the
  weight trend chart directly above it. The chart reads last now (ADR-0030, amending
  ADR-0023's placement); the weigh-in card keeps quoting the trend, so a weigh-in is still
  logged with it in view.
- The log food dialog put the Meal field below the optional "More nutrition" disclosure,
  second from last on the most-used dialog. Meal sits under Serving and Servings.
- The region settings page was seven unlike settings in one 751 px column. It is two groups
  under small headings, Dates and times and Units, the shape the defaults page already had.
- A wrong comment in the layout sweep said a fresh browser context inherits nothing from the
  project; it inherits the signed-in state.

Kept, with reasons: Repeat sits last in the task and transaction dialogs, since repeating
tasks and transactions have never been used and last is where a rare option belongs, while
the event dialog puts Repeat under Ends because recurrence is common for events; the Activity
page's quick-add bar, search and status row above the list, since capture is the page's
daily job, the other two are the list's own controls, and the first task starts at 316 px;
the categories page's add form above its list, the app's pattern for every add bar; the
dashboard, which opens with Slate; the review, whose AI summary sits above the figures it
narrates; the settings index and the seven settings pages that open with the same three
blocks; the calendar's chips, month nav and grid; the sidebar and tab bar opening with
Dashboard and closing with Review.

### Pass 4: visible grouping — done 2026-09-12 (T38)

Walked every screen at both widths in light, the daily five in dark, and every dialog at
393 px, and measured gaps, containers, alignment and dialog footers from bounding boxes,
against proximity (things that belong together sit closer to each other than to anything
else) and uniform connectedness (things inside one border or background read as one group).

Fixed:

- The budget month control spilled its row at 393 px whenever "This month" showed: five
  controls 362 px wide in a 345 px row, hanging 8 px past the left edge and 9 px past the
  right. It wraps now, as Review's week control does, and the layout sweeps load a past
  month, which reports the spill unaided; the blind spot was the route list, not the detector.
- On the Activity page, open tasks sat 28 px right of done tasks, because the reorder grip
  sits outside the card; the done list takes the same inset, so every card shares one edge.
- Four field grids put 12 px between fields while a label sits 8 px above its own control;
  they use 16 px.
- The event dialog's footer was a small left-aligned pair where twelve dialogs stack a
  full-width primary over Cancel; it stacks on a phone. New goal's actions sat at the end of
  its fields, and Plan review's were the only dialog buttons drawn smaller than their fields;
  both take the footer shape.
- Section headings on the Activity page, and on the two settings pages with no description,
  sat as close to what came before as to what they head; their bottom margins shrank. The
  "Clear all data" button aligned with its icon rather than its text.

Kept, with reasons: rows 8 px apart whose parts are 12 px apart read correctly because every
row has a border and a tint; the dashboard's Budget and Categories cards duplicate a figure
only when one category is budgeted; the weigh-in card's quote of the trend is ADR-0030's
mechanism; the water and weight block is two boxes for two logs; the field ladders (8, 16,
20, 40 px), the data page's rhythm, the goal editor's rules and the Slate band labels were
measured and right; the reorder grip stays outside the card, as `sortable-list.tsx` intends.

Noticed for the suite: the layout sweeps walk default URL state, so `/activity?goal=`,
`/calendar?view=week` and `/meals?date=` are the same shape as the month blind spot; and
`clearQueue` in `companion.spec.ts` reads the page before it has settled, so a proposal can
survive it and open the review dialog on `/goals` under a later spec.

### Pass 5: one thing stands out — done 2026-09-12 (T39)

Walked every screen at both widths in light, the daily screens, the review and the trends
page in dark, and every dialog at 393 px, with an inventory of everything drawn to stand
out (filled and destructive buttons, coloured text, tints, heading weights), against the
Von Restorff effect (the one element that differs is the one noticed, so a screen gives its
main action the one distinctive treatment) and Prägnanz (a weight, colour or border that
carries no information is noise).

Fixed:

- The daily screens drew two or three filled buttons: the page's action and the quick-add
  bar's submit on the dashboard, Activity, Budget and Meals, plus "Read the receipt" on
  Budget, a weekly action at the daily one's weight, and the weigh-in Save on Meals, the
  rarest log drawn loudest. Every quick-add submit, Read the receipt, the weigh-in Save and
  each routine card's Run (the habit card's Log was already outline) are outline now, so New
  task, Add, Log food and New routine are the one fill on their screens. `emphasis.spec.ts`
  counts the filled buttons on the daily screens and names the one allowed.
- Seven outline buttons drew no border in light mode (the dashboard's Review and Add event,
  the data page's Export and Download, the first-run panel's three), because
  `buttonVariants()` was used without `cn()` and the base `border-transparent` survived.
  Every call site goes through `cn()`.
- The Macros and Budget cards drew their titles small and muted where the other three
  dashboard cards did not; all five share one heading. Their icons stay.
- The saved meals dialog's one action was outline, the only dialog whose main action was
  not filled; it is filled.
- The barcode scanner opened as a second dialog over Log food with no scrim, so two titles
  and two footers showed at once: base-ui drops the backdrop of a nested dialog, and
  `DialogContent` now takes `forceOverlay` to keep it.

Kept, with reasons: the goal editor's Delete is already the quiet treatment (ghost, red
text), the same as every secondary delete; the data page's red "Clear all data" panel is a
warning and should stand out; the two Save buttons on the defaults and AI pages each save
their own section; the PageTabs icons are one convention across three strips and removing
them would not stop the strips scrolling; the dashboard calendar's display-face heading is
the month's name, content rather than a card label; sixteen of twenty dialogs have exactly
one filled primary and the title as the heaviest text, and the delete confirm's tinted
destructive over outline Cancel is right.

Asked, and open: whether to shorten the explainer paragraphs (the repeating tasks page's
140 px, the lists page's 100 px, the two budget AI panels' 436 px together, 38 percent of
the page); and the three panel species and three row species Pass 4 listed, which Pass 5
judged a consistency question too broad for a single pass and left recorded here.

### Pass 6: reach — done 2026-09-12 (T40)

Measured the hit box of every interactive element on every screen and dialog at 393 px
(478 targets on the phone, 633 on the desktop) with a probe at each box's centre, plus each
daily action's position against the thumb zone, against Fitts's law: the time to hit a
target grows with distance and shrinks with size, and WCAG 2.2 AA's floor is 24 × 24 CSS px.

Fixed, each by enlarging the hit area with padding the way the checkbox already hides a
38 × 30 target behind its 16 px box, nothing moved or drawn larger:

- The dashboard's capture input was a bare 20 px input where the other three quick-add bars
  are 32 px; the Slate's task titles were 20 px links in 32 px rows; four "see all" links
  were 16 px; the Lists page's names were 20 px links in 40 px rows.
- Five icon buttons had no padding, 14 to 16 px: the subtask toggle and delete, and three in
  the goal editor. Four disclosures (Details, Show on the Tasks page, and the two `<summary>`
  folds) were 16 to 20 px.
- The fold chevrons, the "Open Macros" and "Open Budget" arrows and the drag grips sat
  exactly on the 24 px floor for daily chrome; they are 28. `reach.spec.ts` measures each of
  them and holds the floors.

Kept, with reasons: every daily screen's page action sits top right, the platform's own
convention for a page action (Jakob's law, Pass 1), with the quick-add bar just beneath it,
and a floating button would be a second fill (Pass 5); the calendar event chip inside its
day cell, the app's one target-spacing failure, is filed for Pass 8 as a mis-tap; the goal
card's body opens the goal's tasks while its editor is a chevron, a split made on purpose;
the button and input scale (36 and 32 px, per-item controls 28) is the app's density, above
the floor everywhere now and a system-wide call to change; the tab bar's five 79 × 56 slots
flush to the bottom edge, the More sheet's 48 px rows, every dialog's low full-width
primary, the rows' wide title targets, the day cells and the palette's 44 px rows were
measured and right; nothing is hover-only, so a touch user gets the mouse user's targets.

Noticed for the suite: `playwright.config.ts` sets no `actionTimeout`, so a click on a locator
that never appears burns the whole test timeout and its retry; a modest one would fail fast.

### Pass 7: input

- Keep: the quick-add bars read plain language, dates included, and the meals bar keeps its
  text when it cannot parse it; a new transaction's date starts at today, or at the first of
  the month being viewed.
- Look at: amounts are number inputs, which cannot take a pasted "$1,234.50".
- Look at (Pass 2): the budget quick-add bar writes no payee; its text becomes the
  description, which the payee memory reads but the ledger's payee column does not show.
- Look at (Pass 2): some `FieldLabel`s had no `htmlFor`, so their select triggers had no
  accessible name; Meal, Priority, Type and Category were fixed in passing. Sweep the rest.
- Look at (Pass 4): the label on the budgets page's total row stretches to 171 px while its
  text is about 120, so its click target is wider than its ink.
- Look at (Pass 5): the appearance page saves on every change while the other six settings
  pages have a Save button.
- Look at (Pass 6): the plan review dialog edits a proposal through 16 to 20 px inline inputs
  packed 26 px apart, an input design rather than a reach question.

### Pass 8: mistakes

- Keep: undo toasts after deletes across the app; confirmation before deletes that take other
  data with them, such as a category and its budgets.
- Look at: applying an AI proposal creates its rows with no undo.
- Look at (Pass 2): the budgets form seeds itself from server props in an effect whose
  dependencies are new arrays on every render, so it re-seeds on any re-render and can put
  a figure back over one being typed. `budgets-page.spec.ts` waits around it.
- Look at (Pass 6): a calendar event chip is 18 px tall inside a day cell that is itself a
  target, the one target-spacing failure in the app, so a tap meant for the event can open
  the day's create dialog instead.

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
- Look at (Pass 3, withdrawn by Pass 5): the saved meals dialog's empty state does carry a
  sentence saying what a saved meal is for.

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
