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
| 7   | Interaction | Input                             | Postel's law + defaults               | Medium | Done 2026-09-12 |
| 8   | Interaction | Mistakes                          | Error prevention + error recovery     | Medium | Done 2026-09-12 |
| 9   | Feel        | Speed and feedback                | Doherty threshold                     | Light  | Done 2026-09-12 |
| 10  | Feel        | Progress and endings              | Goal-gradient effect + peak-end rule  | Light  | Done 2026-09-12 |

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

### Pass 7: input — done 2026-09-12 (T41)

Catalogued every input from the source (type, keyboard hint, schema rule, normalisation,
error text) and the four quick-add parsers, then probed the daily forms and bars in the
browser with the values a person types or pastes, against Postel's law: liberal in what a
field accepts, conservative and consistent in what the app answers.

Fixed:

- The meals bar rejected its own placeholder: `2 eggs` and `Eggs x2` both answered "nothing
  called", because a leading bare number was not read as a quantity and the food index only
  stripped a plural from words longer than four letters, so `eggs` never met "Egg". Both
  read now. `banana 100 cal 1 g protein` logged a food named "banana 1 g protein" with no
  protein, because a macro's unit letter had to touch its digits; a unit and a space are
  allowed.
- The Activity page's quick-add bar read only the `#list` tag, so `Call mum tomorrow` kept
  the word in the title and set no date, while the same words in the dashboard's bar
  scheduled the task. Both bars read dates the same way; an undated line on the Activity
  page still lands in Someday, the default its comment defends.
- The transaction Amount was the one money field without `inputMode="decimal"`, and the log
  food dialog's five number fields had none, so a phone raised the wide keyboard for the two
  daily dialogs; every money and macro field raises the decimal keypad.
- The event dialog's Calendar and Repeat selects and two settings selects had no accessible
  name; eight button groups had a label pointing at nothing; the food search's name, "Search
  foods", disagreed with its visible label, "Find a food", and cmdk names its input from its
  root rather than from `aria-label`, so the food bars and the palette's search box are named
  there; one label sat over a list. Each is named as it reads.

Kept, with reasons: the Amount takes `1,234.50`, `$12`, `12` and `12.` as a person would
expect (the earlier note that it could not was wrong in Chromium); `#tag` handling folds
case, spaces, underscores and hyphens and strips the tag whether or not it resolves; the
budget parser reads signs, `$`, grouped thousands and bare numbers; every text field trims;
blank micronutrients stay unknown rather than zero; Enter is safe in both search boxes and
submits the right form everywhere; water is presets, not a field; a bar keeps its text when
it cannot parse it. The decimal comma (`12,50` reads as 1250 in the Amount and `72,5` as
725 lb) is left: the owner's locale uses a point, and a locale-aware amount is a text field
with its own parse, a larger change than this pass; the weight bound goes to Pass 8. The
browser's validation bubbles answering before the app's own messages go to Pass 8 too.

Still filed: the budget quick-add bar writes no payee (its text is the description); the
budgets page's total label is wider than its text; the appearance page auto-saves where six
pages have Save; the plan review dialog edits through small inline inputs.

### Pass 8: mistakes — done 2026-09-12 (T42)

Catalogued every destructive action and what protects it, every failure path and its
wording, every place typed input can be lost, and every bound and who enforces it; then
probed each in the browser, deletes with a stopwatch on the Undo, the network off, dialogs
dismissed mid-entry, forms double-submitted; against error prevention (the wrong action is
hard, and a delete that takes other data is confirmed) and error recovery (an undo where
the neighbours have one, plain messages, nothing typed thrown away).

Fixed:

- Deleting a calendar cascade-deleted its events with nothing in the way, and deleting a
  list unfiled its tasks in silence, where the categories page confirms and names what goes.
  Both confirm, naming the count. A weigh-in delete had no Undo while the water card beside
  it did; it has one.
- Applying an AI proposal created its rows with no undo, no confirm and no word, and a
  failure part-way left the rows that landed with the panel still showing the plan and Apply
  answering "already been dealt with". Apply returns what it created, says so, and offers an
  Undo that removes exactly those rows, on success and on a partial failure alike.
- A failed write with the network off replaced the whole route with its loading error and
  threw the typed line away, on the Activity and Meals pages alike, and did not recover when
  the network returned. Every capture bar and daily dialog runs its write through one helper
  that catches the failure, says "Couldn't reach the app's own server. Nothing was saved."
  and keeps what was typed.
- The browser's validation bubble answered before the app on the daily fields, in its own
  words and an American date format on an app with Region settings, while the app's own
  messages went unshown. The habit and transaction dialogs, the two whose fields carried
  browser-only rules, validate through their schemas alone; the transaction date's month
  fence and the amount's two-decimal step, which lived only in the inputs, are rules with
  plain messages ("Pick a date in September 2026").
- Zod's default text reached the user where a rule had no message ("Too big: expected number
  to be <=100000", "Invalid UUID"); the macro, servings, payee, description, amount ceiling
  and id rules speak plainly, as "Enter an amount" already did. The categories page's name
  and description caps still carry zod's words, a rare page left for another day.
- Undo toasts ran on sonner's default 4 seconds, measured 4.4, the shortest window in the
  app and a default nobody chose; toasts carrying an Undo stay 8. The routines page's drag
  reorder was the one optimistic write without `useWriteGuard`; it has it.

Kept, with reasons: every event-delete path and its two undo shapes; the goal-delete
dialog's practice choice; the typed-word confirmations on clear-all and restore, and the
import that validates before it deletes; the feed-token confirm; copy last month being
non-destructive by construction; the capture bars keeping their text and clearing at once so
a burst cannot double-post (measured: one row); every form keeping its values on a failed
submit; the double-submit guard on all 35 submit buttons; the subtask delete's documented
no-undo. The weight bound (20 to 1500 lb) stays: 725 is a typo the app cannot tell from a
reading, and a narrower bound would refuse real ones. The budgets form re-seed filed by Pass
2 did not reproduce: its props come through a `useMemo`, and the page only revalidates on
Save and Copy, which want the re-seed.

Asked, and open: whether Escape and a backdrop tap should discard a half-typed dialog
without a word (24 dialogs; the narrower version keeps Escape and makes only the backdrop
non-dismissive on the long forms).

### Pass 9: speed and feedback — done 2026-09-12 (T43)

Measured on a production build of the tree, started on its own port against the test
database, never the dev server: fourteen daily interactions ten times each at 393 px, the
event's own duration from a `PerformanceObserver` and the time from the input to the first
frame with the result on screen, plus a cold load of every daily route; then catalogued what
shows during and after every wait. Against the Doherty threshold (400 ms) and today's
Interaction to Next Paint target (200 ms).

**Measured, and within threshold everywhere.** The worst event duration at p95 was 136 ms
(opening the log food or transaction dialog); the worst input-to-result 212 ms, of which
150 is the food search's deliberate debounce; optimistic paths (ticking a task, a fold) 8 to
49 ms; a tab-bar change acknowledges in 5 to 11 ms and every app route has a skeleton, the
Activity and Budget ones carrying the real heading. Cold, every route paints within about
110 ms; the dashboard and the calendar reach real content at about 450 ms, the other six at
130 to 160, the difference being data work after the shell, not the server (36 to 50 ms to
first byte everywhere).

Fixed:

- The refinement box's Revise button showed nothing at all while a generation ran, keeping
  its icon and staying enabled, while the plan review's footer button read "Applying…"
  because it read the same busy flag. Revise shows the spinner and disables while busy, and
  "Applying…" appears only for an apply.
- An AI request can run up to 90 seconds with only a label change ("Reading…", "Thinking…")
  on its trigger, at five places. Each shows the spinner beside the label and one shared
  sentence saying how long it can take.
- The Activity page's quick-add bar was the one capture bar that said nothing on success; it
  toasts what it parsed like its three siblings.

Kept, with reasons: every interaction measured; dashboard folds and task ticks update
optimistically and the capture bars clear at once; the section strips without a pending
spinner, since the destination's skeleton arrives within about 30 ms; the water card and
quick-pick strip disabling during a write, a window of one insert; the error boundary's
"Try again", whose acute case T42 removed by keeping failed writes out of it; the
transaction dialog's Add staying disabled above the initial-posts cap with a line saying
why. Left for another day: a way to cancel a generation, which needs an abort signal through
the request and a decision about a half-finished generation on the server; the dashboard's
and the calendar's data cost on a cold load, which HANDOFF §6 already names.

### Pass 10: progress and endings — done 2026-09-12 (T44)

Walked ten flows from start to end at 393 px (a day of tasks on both surfaces, a habit's
week, a day of food and water, a goal to its target, a routine run, the four AI flows, the
weekly review, a budget month, and every capture bar and dialog's closing toast) and every
list's empty state, against the goal-gradient effect (progress visible and honest, and the
finish shown as it nears) and the peak-end rule (a flow ends with a word that says what
happened, and an empty state says what the thing is for).

Fixed:

- Log food ended in the bare word "Logged" while its four siblings name the food; it names
  the food. Discarding an AI proposal ended in silence, and Pass 0 found discard the more
  common ending; it says "Discarded", the shape "Marked as read" already had. A routine run's
  toast names the routine. `+500 #bonus` toasted "Added transaction"; with no words to name
  it says the amount and the category.
- A finished goal read as unfinished: a full bar, and the momentum still "Moving". At the
  target, or with every milestone done, the card and the editor say so. A finished day of
  tasks ended with the Today heading gone and struck rows on the Slate until midnight; both
  say "Everything due today is done."
- The routines page's empty state was the one Activity page saying only "No routines yet."; it
  says what a routine is for. The categories page's was the one drawn as a bare line; it sits
  in the dashed box every other list uses. The first-run panel said it replaced the four
  card-level empty sentences and did not; it does.
- Suite: the transaction cleanup helper matched on payee only, so rows the quick-add bar
  created were never deleted and every such cleanup reported success; it matches the
  description too.

Kept, with reasons: the habit meter's growing overshoot, an honest reading; the macro
percentages past 100 with the bar clamped; the budget's per-category and month readings and
the dashboard's month bar; the AI apply toast naming exactly what it created, taking the
front of the stack (the Pass 8 order note resolves); the receipt and summary endings; the
Slate, tasks, habits, lists, repeating, goals, saved meals, food library and trends empty
states; the review's headline and its elapsed-days denominator; a pending AI proposal
surviving a reload.

Ideas recorded, not done, because each adds a state or a target the app does not have and
is a taste call: a moment at a habit's quota beyond the surplus colour; protein past its
target drawn the same red as calories past theirs, where one is a floor and the other a
ceiling; the review ending on a card and pointing nowhere, and an empty week printing
"Nothing recorded" above four cards of zeros; a water target, the one daily log with no
progress and no end; a budget month's ending, since a past month renders exactly like the
current one; a goal card that holds both milestones and a number showing only the
milestones.

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
