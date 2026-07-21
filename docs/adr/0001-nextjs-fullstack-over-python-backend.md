# ADR-0001: Next.js Full-Stack Over a Separate Python/FastAPI Backend

- Status: Accepted
- Date: 2026-07-21

## Context

Winnow is a CRUD app across four modules (to-dos, calendar, budgeting,
meal macros) plus a unified dashboard, for a single user, self-hosted on
home hardware. There is no ML, no heavy compute, and no workload that
needs Python. The user's frontend skills skew Next.js + Tailwind +
shadcn; Python is their language of choice for ML work specifically, which
this project does not involve.

## Decision

Build Winnow as a single Next.js (App Router) application that serves both
the UI and the API (Route Handlers and Server Actions), deployed as one
Docker container. Do not stand up a separate Python/FastAPI backend
service.

## Consequences

- One codebase, one language (TypeScript) end to end; types and
  validation (Zod) are shared between client and server instead of
  duplicated across two languages.
- One deployable unit — fewer containers to build, version, and monitor
  on home hardware, which matters directly for solo maintainability.
- Directly matches the user's existing frontend skill set; no context-
  switching cost.
- Python is not used anywhere in this project, which is fine — there is
  no workload here that needs it. If a future feature genuinely needs
  Python (e.g., a data-science-flavored analysis of long-run budget or
  macro history), that would justify a separate service **at that time**;
  it is deliberately not designed for now.

## Alternatives Considered

- **Separate FastAPI backend + Next.js frontend**: rejected. Doubles the
  deployment and maintenance surface (two containers, two dependency
  ecosystems to keep updated), duplicates validation logic across two
  languages, adds a network hop between frontend and backend, and buys
  none of Python's actual strengths (no numerical/ML workload exists
  here).
