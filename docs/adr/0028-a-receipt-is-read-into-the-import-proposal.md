# ADR-0028: A Receipt Is Read Into The Import Proposal, One Row Per Category

**Status:** Accepted
**Date:** 2026-09-11
**Amends:** ADR-0011 (its privacy grading: a photograph now joins pasted text at the top
of the grade); ADR-0015 is followed, not amended (the tool lives on `/budget`)

## Context

The budget's transactions are entered by hand, posted by a recurrence, or read out of
pasted text by the companion's `import` job. The ask was a receipt scanner: photograph a
receipt, have the AI turn it into transactions, review and edit what it proposes, accept
or deny it. With one instruction that shaped everything: **one transaction per category
of item.** A supermarket receipt with eggs, milk, chips, a video game and a pack of
trading cards is two transactions — the groceries and the rest — because that is how the
budget is kept, and a single "Walmart, $60" would put a video game under Groceries.

Three things were already true. The `import` job's rows are a transaction's fields; its
review panel on `/budget` prunes rows and its Apply creates them through
`createTransaction`, with category names matched to the user's own by `resolveCategory`.
The AI client speaks two wire protocols, both of which accept an image beside text. And
the app has no image handling at all — the barcode scanner decodes with a library, not a
model.

## Decision

**A scan is an `import` proposal.** The generate route gains a `receipt` request kind;
what it stores is an `import` proposal whose payload carries the rows plus what was read
(`importProposalPayloadSchema`: `source`, `receipts`). The review, the refinement box,
Apply, Discard and the pending queue are the import path unchanged. No new proposal kind,
no new table, no migration for proposals.

**The model reads; the app does the arithmetic.** The model returns each receipt as it is
printed — merchant, date or null, the total actually paid or null, purchase or refund, and
every line with its own total and a category name. `rowsFromReceipts` then makes **one
row per category per receipt**: lines are grouped by the category the model gave them,
matched to the user's names case-insensitively; a name the user does not have is kept as
written and lands uncategorised, `resolveCategory`'s rule; lines with no category form
their own uncategorised group. The difference between the total and the lines — tax,
discounts, tips — is spread across the groups in proportion by `allocateCents`, with
largest-remainder rounding, so **the rows add up to what left the account** and reconcile
against a statement. No total means the rows are the lines; no lines but a total means one
uncategorised row; neither means nothing, which is a correct answer. The model is told
today's date rather than asked to guess a year, and is never asked to multiply by a
hundred.

**Categories carry a description, and the prompt reads it.** `categories.description`
(migration `0046`, nullable) is the user's own note on what belongs in a category —
"groceries and household staples", "video games and trading cards". The prompt lists
every category as `Name (description)`. The names alone cannot say where a pack of cards
goes, and the categories are the user's to add, rename and merge, so the note has to live
beside the name rather than in a prompt someone would have to keep in step. The pasted
import reads the same list.

**The photo is shrunk in the browser and never stored.** `resizeImageFile` caps the long
edge at 1600 px and re-encodes as JPEG on the device before upload: the model reads a
receipt just as well at that size, the provider downscales anything larger itself, and a
12-megapixel original has no business crossing a home upload link. The request carries
base64, bounded at about 3 MB decoded and validated as such. Like the pasted text, the
photo is sent to the provider once and the proposal keeps only what was read; a
refinement resends it from the panel that still holds it. ADR-0011's grading is amended
to say so: a receipt photograph sits with pasted text at the top of the grade, and the
panel says so above the button.

**The review became editable.** The `import` review deliberately had no editing — the
field most likely to be wrong on forty pasted rows is the category, and the honest answer
was to land them uncategorised and fix them on `/budget`. A scanned receipt is two or
three rows, and the field most likely to be wrong is the **amount**, which pruning cannot
fix. Each row now opens into an editor for its date, payee, amount, type, category and
description; the pasted import gets it too, since there is one component. Apply sends the
rows back and the server re-validates them, which is what makes the editing safe, and it
already did.

**Rows first, reading beside them.** The review shows "what it read" above the rows —
merchant, date, total, line count — with a warning when no date or total was read, and
when the lines and the total disagree by more than tax could explain (15%). The line
names become each row's description, so a row says what it covers.

## Consequences

- **Reconciliation by construction.** Because tax is spread rather than dropped or listed
  on its own, the rows of one receipt always sum to its total, to the cent. The trade is
  that a category row carries a proportional share of tax rather than the tax that item
  actually attracted — groceries are often untaxed where a video game is not. That is a
  bookkeeping approximation the user can correct in the editor, and it is stated in the
  panel; a per-line tax rule would need data no receipt prints.
- **A model that cannot see** answers a bare 400. The route maps that to "the configured
  model may not read images — choose one that does in Settings", since the choice is a
  setting and not a bug. Whichever model is configured is used; nothing here picks one.
- **The e2e stub answers a fixed reading** to a marker in the text part of the request,
  so the primary path is driven offline: upload, preview, request, derivation, editing,
  Apply, refinement, Discard. The fixture is a striped 64×96 PNG. Real-model quality stays
  permanently unverified in CI, as ADR-0011 accepts.
- **Two jobs, one queue.** "Read transactions" and "Scan a receipt" share one
  `useProposal` in `BudgetAiTools`, because both produce `import` proposals and two hooks
  over one pending list would render the same proposal twice. Which panel offers the
  refinement follows the proposal's `source`.
- **`importPayloadSchema` stays free of optional properties**, and a test pins it: the
  stored shape (`importProposalPayloadSchema`) is a second schema, because a strict
  provider rejects a schema whose `required` does not list every property.
- **The existing Anthropic path forces a tool call**, which Claude Fable 5.1 rejects; a
  receipt scan on that model fails the same way every companion job does there. Not this
  ADR's problem to solve, and worth a line so nobody debugs the image first.

## Alternatives considered

- **One transaction per receipt.** The first plan, and simpler; rejected on the instruction
  above. A receipt from one shop is not one kind of spending.
- **One transaction per line.** Wrong for a ledger that reconciles against a bank: one
  card charge would become twenty rows, and the totals per category would still need
  computing.
- **A `receipt` proposal kind.** An enum migration, a fourth review renderer, and a copy
  of the import apply path, to store the same rows.
- **A receipts table.** Nothing reads a stored reading after Apply; the payload column
  already holds it for the review and the refinement, and a table with no reader is a
  column with no writer.
- **Keeping the photo.** Storage for something the proposal has already been read out of,
  and a second copy of a document with a card's last four digits on it.
- **The Anthropic SDK.** The app speaks the wire protocol with `fetch` for two providers
  and a self-hosted third; an image content block is a few lines on each builder, and a
  dependency for one of the three would have split the client.
