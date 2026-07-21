# ADR-0003: PostgreSQL + Drizzle ORM

- Status: Accepted
- Date: 2026-07-21

## Context

Winnow's budgeting module needs real relational integrity (accounts,
transactions, categories, budgets, and correct money math), and all four
modules share a consistent, structured, user-scoped relational shape
(ARCHITECTURE.md §3). The app is TypeScript end to end (ADR-0001) and
self-hosted via Docker on home hardware (ADR-0002).

## Decision

Use PostgreSQL as the single datastore — one Docker service, one
persistent named volume — and Drizzle ORM for schema definition,
migrations, and type-safe queries from the Next.js app.

## Consequences

- Postgres provides real transactions, foreign keys, and constraints,
  which is the right tool specifically for the budgeting module's
  correctness requirements, and is a sound default for the other three
  modules' structured, relational data too.
- Drizzle keeps SQL transparent — it's a thin query builder, not a heavy
  abstraction — so generated migrations are plain, readable SQL the user
  can inspect and reason about rather than an opaque engine's output.
- Drizzle's types are inferred directly from the schema definition,
  matching the "TypeScript end to end" direction from ADR-0001 with no
  separate schema/type-generation step to keep in sync.
- One database technology for the entire app; no per-module datastore
  sprawl to operate or back up.
- Drizzle's ecosystem is lighter and younger than Prisma's — there's no
  bundled GUI as polished as Prisma Studio (Drizzle's `drizzle-kit
  studio` exists but is less mature), so slightly more comfort with raw
  SQL is expected of the maintainer. Accepted as a reasonable tradeoff
  for the transparency and control gained.

## Alternatives Considered

- **Prisma**: a strong alternative with a more polished developer
  experience and larger ecosystem (including Prisma Studio as a data
  browser). Not chosen as the default because it's a heavier runtime
  abstraction with historically slower cold starts, which matters more on
  modest home-server hardware than it would on managed cloud infra.
- **SQLite**: rejected. Self-hosting already provides a real always-on
  server, so SQLite's core advantage (no separate database process) buys
  nothing here, while Postgres's stronger typing and constraint model
  suit the budgeting data better. Docker also makes running Postgres as
  a service trivial, further removing SQLite's usual "simpler ops"
  argument.
