import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// Relative import (not "@/db/schema") so drizzle-kit resolves it without aliases.
import { users } from "../../db/schema"

// The enum exists rather than a plain text column because the renderer switches on it,
// and a typo would render nothing rather than fail.
export const proposalKindEnum = pgEnum("proposal_kind", [
  "goal_plan",
  "routine",
  "summary",
  "import",
])

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "applied",
  "discarded",
])

/**
 * A generated proposal, awaiting your judgment.
 *
 * The model never writes to the app's own tables (ADR-0011) — it writes here, and this
 * row is inert until `applyProposal` turns it into real rows through the same actions
 * the UI already calls. So a bad generation is a row you delete, not data you repair.
 *
 * Rows persist rather than living in client state because a generation takes 5–60
 * seconds and costs money: losing one to a stray navigation would be the app throwing
 * away something you paid for and waited on.
 */
export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: proposalKindEnum("kind").notNull(),
    status: proposalStatusEnum("status").notNull().default("pending"),
    /**
     * What the proposal is about — a goal id for `goal_plan`.
     *
     * Deliberately NOT a foreign key. Later kinds point at different tables (a routine, a
     * month, nothing at all), and a column that must reference three tables can reference
     * none. The cost is that a deleted goal leaves a proposal pointing nowhere, so
     * `applyProposal` re-checks the target exists and belongs to the caller before writing
     * — the same guard `checkCategory` performs for budget's client-supplied ids.
     */
    targetId: uuid("target_id"),
    /**
     * The generated payload, validated by `goalPlanPayloadSchema` on the way in and again
     * on the way out. `jsonb` rather than columns because each kind has a different shape;
     * normalising four shapes into one table would be four sets of mostly-null columns.
     */
    payload: jsonb("payload").notNull(),
    /** Which model produced it, so a bad run can be traced to a provider change. */
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Set when applied. Nullable and forward-only, mirroring `milestones.completedAt` —
     * `status` says what happened, this says when.
     */
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    // The only read: this user's pending proposals, newest first.
    index("ai_proposals_user_status").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
  ],
)
