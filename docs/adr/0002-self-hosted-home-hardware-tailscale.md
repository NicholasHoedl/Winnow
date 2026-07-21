# ADR-0002: Self-Hosted Home Hardware + Tailscale Over Managed Cloud

- Status: Accepted
- Date: 2026-07-21

## Context

Winnow holds personal data — tasks, calendar, financial transactions, and
meal/macro logs — for a single user who wants to fully own that data,
avoid recurring cloud cost, and is willing to maintain a small always-on
home machine. The app needs to be usable from a laptop and installed on
an iPhone, and PWAs require a secure (HTTPS) context for service worker
registration and a clean iOS install.

## Decision

Self-host Winnow on the user's own always-on home hardware (mini PC,
Raspberry Pi, NAS, or desktop — TBD, see SPEC.md open question #7), via
Docker Compose. Restrict all network access to the user's Tailscale mesh
(tailnet) — no public internet exposure at any point. Obtain valid HTTPS
via Tailscale's own certificate feature (MagicDNS + `tailscale cert`,
ideally through `tailscale serve`) rather than a public TLS certificate,
reverse proxy exposed to the internet, or port-forwarding.

## Consequences

- Zero recurring hosting cost and full data ownership — no third party
  ever holds this data.
- No public attack surface at all: the app is unreachable except from
  devices explicitly joined to the tailnet. This sidesteps an entire
  category of hardening work (brute-force protection, public TLS
  management, exposed-service patching) that a public-facing deployment
  would require.
- Single point of hardware/network failure: if the home machine, its
  disk, or the home internet/power goes down, the app is unavailable.
  Acceptable for a personal daily-use tool; this is why backup **and
  restore** are an explicit, tested roadmap deliverable (ROADMAP.md
  Phase 5) rather than an assumption.
- The user is solely responsible for OS, Docker, and Tailscale updates —
  there is no managed platform doing this for them. Accepted as the cost
  of the ownership/cost tradeoff above.
- Getting a browser-trusted HTTPS origin without a public domain is
  solved specifically by Tailscale's certificate feature — this is the
  mechanism that makes the iPhone install goal actually work; see
  ARCHITECTURE.md §4.3 for the full mechanics.

## Alternatives Considered

- **Managed cloud (small VPS or PaaS)**: rejected for v1. Introduces
  recurring cost, moves the data off the user's own hardware, and would
  require its own real hardening if exposed to the public internet
  (public TLS, brute-force protection, etc.) — exactly the class of work
  Tailscale avoids entirely for a single-user tool. Worth revisiting only
  if the user later wants access from a device that can't join the
  tailnet, or wants uptime independent of their home network/power.
