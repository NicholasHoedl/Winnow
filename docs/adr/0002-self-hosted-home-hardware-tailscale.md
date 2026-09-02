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

## Amendment: "always-on" needs Docker Engine in WSL2, not Docker Desktop (2026-08-17)

The decision above says **always-on home hardware** and treats that as a property of the
machine. On the chosen host — a Windows 11 desktop — it is not. It is a property of how
Docker is installed, and the obvious installation breaks it.

**Docker Desktop is a Windows GUI application tied to a login session.** After a Windows
Update reboot the containers stay down until somebody logs into the desktop. That is not a
configuration detail to be tuned later; it falsifies the assumption this ADR is built on.
An organizer that is unavailable every patch Tuesday until you walk to the machine is not
the thing described above, and the failure lands precisely when it is least visible — you
reach for it on a phone, from elsewhere, and it is simply not there.

The subtlety that makes this worth writing down: **using Docker Desktop's WSL2 _backend_
does not fix it.** The backend is where the containers run; the lifecycle still belongs to
the Windows GUI process, which still belongs to the login session. Choosing "WSL2 backend"
in Docker Desktop's settings looks like it addresses this and does not.

**The decision: skip Docker Desktop.** Install Docker Engine natively inside a WSL2
distribution, and give it a lifecycle that does not involve a human logging in:

1. `systemd=true` under `[boot]` in `/etc/wsl.conf` inside the distro.
2. Docker Engine installed in the distro, `systemctl enable docker`.
3. A Task Scheduler task triggered **at system startup** — not at logon — that starts the
   distro, so systemd comes up and `docker` with it.

`docs/runbooks/deploy.md` carries the procedure.

### Consequences

- ~~The compose stack survives a reboot with nobody logged in, which is what this ADR always
  claimed and did not previously have.~~ **This was predicted, then tested, and it is false.
  See the second amendment below.**
- Docker Desktop's licensing question disappears along with Docker Desktop.
- **More setup, and setup that only a human can do.** It needs elevation, and it is the
  first thing in the deploy that has no fallback if it goes wrong — hence its position as
  the first blocking item rather than a step buried mid-runbook.
- The trigger is at _system startup_, and that distinction is the whole point. A logon
  trigger reproduces the original problem exactly while appearing to solve it.

### Alternatives Considered

- **Windows auto-login.** Would work, and leaves a machine holding the user's finances,
  calendar and daily schedule unlocked at its own console. Rejected: this ADR's premise is
  data ownership, and physical access is part of that.
- **Accept manual restarts.** Rejected. It is the option that quietly kills daily use — the
  app is down exactly when it is reached for, and the habit the §10 soak exists to build
  does not survive that.

## Second amendment: the always-on property does not hold, and the rejected option is in force (2026-08-25)

The first amendment moved from Docker Desktop to Docker Engine inside WSL2 specifically to
get a stack that "survives a reboot with nobody logged in". **The deploy happened, that
property was tested directly, and it does not hold.**

What was observed on the real host:

- The Task Scheduler task from the runbook's §0 **works when run by hand** — `wsl --shutdown`
  first, then Run, and the distro starts.
- At boot with nobody signed in, **it does not**. Waiting three minutes changed nothing;
  `wsl --list --running` showed no distribution.
- Signing in and simply **opening Ubuntu from the Start menu was enough** — Docker and both
  containers came back behind it with no command typed. So everything below WSL is correct;
  the only broken link is WSL starting itself.

**The reason is that WSL2 is not a service.** A distribution belongs to a Windows user
account and expects an interactive session. A scheduled task at startup runs in Session 0,
the non-interactive services session, and WSL does not reliably launch there. That is a
property of WSL rather than a misconfiguration — which means **this ADR did not remove the
login dependency it rejected Docker Desktop for. It moved it somewhere less visible.**
Docker Desktop's dependency was at least obvious.

**The decision, for now: accept manual restarts.** That is the option this ADR's own
Alternatives Considered rejects, and it is being taken with that rejection in view rather
than in ignorance of it. The rejection's reasoning stands and is worth restating, because it
is a prediction that can now be checked rather than argued: _"the app is down exactly when it
is reached for, and the habit the §10 soak exists to build does not survive that."_ **If the
soak fails, look here first.**

The other option remains open and is unchanged in its trade-off: **Windows auto-login** would
work, because it gives WSL the interactive session it wants — at the cost this ADR already
named, a machine holding the user's finances and calendar unlocked at its own console. It can
be softened by locking the screen immediately after the automatic sign-in, which yields a
running session behind a lock screen. That was not part of the original weighing and may
change the answer; it has not been tried.

What is NOT in doubt, and should not be re-litigated on the strength of this: Tailscale as
the only ingress works exactly as designed. It is a real Windows service, it comes up before
anyone logs in, and it kept answering throughout — which is precisely why the failure
presented as a 502 from a healthy front door rather than as an unreachable host.
