# MFE landscape — where teams actually struggle, and what MFKit should do about it

> Research snapshot, 2026-08-06. Sources are public postmortems, vendor docs,
> practitioner writeups, and 2026 retrospectives — linked at the bottom.
>
> Purpose: stop guessing at roadmap. Every opportunity in Part 4 traces to a
> documented pain in Part 1, and is scored against MFKit's core rather than
> against "would this be cool."

---

## Part 0 — The uncomfortable finding first

The most consistent 2026 signal is **retreat**. Teams are consolidating
frontend boundaries, and the honest summary of why is: *the original pain that
pushed people to MFEs in 2019 is less severe now, and a well-structured
monolith is dramatically simpler.*

The recurring postmortem shape is identical across writeups: split the code,
discover you didn't split the coordination, measure slower velocity six months
later. McKinsey's version of the same finding is that MFE benefits are an
operating-model outcome, not an architecture outcome — *"architecture does not
enforce itself."*

**What this means for MFKit — three things, and they're all positive:**

1. **The tax is tooling-shaped, and tooling is the part we can actually fix.**
   Read the failure lists in Part 1: build pipelines, dependency drift, local
   dev, config duplication, debugging. Almost none of them are "MFEs are
   conceptually wrong." They are "nobody gave us a platform team, and MF
   shipped primitives instead of a system." That gap is exactly MFKit's thesis.
2. **We must be honest about when not to use this.** A `docs/when-not-to-use-mfkit.md`
   that says "one team, one release train, one framework → use a monolith" costs
   us nothing and buys enormous credibility. Frameworks that only sell upside
   read as marketing.
3. **The surviving use cases are narrower than the hype, and MFKit is
   unusually well-aimed at the narrowest one** (polyglot / migration — Part 2).

---

## Part 1 — Where teams struggle, ranked by how often it shows up

Ranked by frequency across sources, with a note on whether MFKit already
touches it.

### 1. Local development is the daily wound

The most cited, most visceral pain. Concretely:

- **Machine load.** "Running the shell plus multiple micro-frontends crushed
  laptops." Every additional MFE is another dev server.
- **Broken cross-app links.** Each app on its own port means a link rendered by
  app A to `/ads/123` resolves against `localhost:3001` — the wrong app.
- **Local ≠ prod config.** *"The configuration you use for local development is
  fundamentally different from what you deploy to production, and if you don't
  understand the differences, you'll spend days debugging issues that should
  never have happened."*
- **Polyrepo coordination.** Nothing starts the other repos for you.

**MFKit today:** partially covered, and it's our strongest existing alignment.
Turbo generation starts every MFE `dev` via `with`; ports auto-assign
deterministically from the MFE name; **and the same manifest produces both the
dev and the prod config**, which structurally kills the third bullet. The
machine-load and selective-run problems are wide open. → **O1**

### 2. Shared dependencies and version skew

- Setting up `shared` is *"pretty complicated, and managing these individual
  settings for each app is difficult and mistake-prone as you have more apps."*
- Duplicate copies of the same dep get downloaded — real bundle cost.
- Singleton detection breaks on non-plain versions (e.g. `-release.99`
  postfixes) and each remote silently loads its own copy.
- Postmortem version: "one app upgraded to React 18, another was stuck on
  React 17," shared libs forked, debugging became very hard.

**MFKit today:** the config-drift half is solved by design — one `shared` block
in the manifest, inherited by every MFE, per-MFE override. The *detection* half
exists only at runtime (`healing/version.ts`). Nothing catches skew at install
or build time, which is where it's cheap to fix. → **O4**

### 3. Config duplication and drift

*"Adding an MFE means editing in five places."* Ports, names, exposes, remote
URLs, shared singletons, Turbo tasks, route maps, remote types — all must agree
across packages, and drift the moment two people touch two of them.

**MFKit today:** this is literally the thesis (decision #1), and it's the one
pain we can claim as *solved* rather than *addressed*. Worth saying out loud in
the README — it's our clearest differentiator against raw Module Federation.

### 4. Production debugging and attribution

- Remote modules fail **silently**.
- *"An error caught by a React error boundary lacks context about which module
  produced it."*
- Perf regressions can't be attributed to the remote that caused them.
- Conventional APM leaves gaps because it has no concept of module identity.

**MFKit today:** unexploited, and we're sitting on the ideal position. Every
load, mount, retry, quarantine, and version mismatch already funnels through
one chokepoint (`healing/runner.ts` + `react/controller.ts`) that *knows the
manifest entry*. Module-attributed telemetry is a hook away. → **O2**

### 5. Independent deployment breaking consumers

A remote deploys, the host breaks. The consensus mitigation is contract testing
plus rigorous semver — but "consensus mitigation" here means "write it
yourself."

**MFKit today:** we generate the host's expectations (`generateRemoteTypes`)
and own a migration planner (`@mfkit/codemods`). We never *check* a built
remote against the expectations. → **O3**

### 6. UI drift despite a design system

*"Teams bypassed or modified shared components"* — the result described as "a
collage." Plus genuine style-isolation problems (leakage in both directions).

**MFKit today:** the mechanical half is fixed — `src/vite/css-inject.ts` was a
real bug nobody else's assertions caught. The governance half (tokens, enforced
component usage) is mostly consumer territory. Partial fit; low priority.

### 7. Performance / bundle bloat

Duplicated deps, N runtimes, slower loads. Frequently cited as the reason the
MFE version measured *slower* than the monolith.

**MFKit today:** `budgetBytes` and `budgets` are **declared in the manifest,
validated by the schema, and enforced nowhere** (`packages/kit/src/index.ts:73`,
`:86`, `:96`; `plugin-api/src/manifest.ts:74`, `:93`, `:119`). A field that
promises enforcement and delivers none is worse than no field. → **O7**

### 8. Cross-app routing and base paths

Coordinating the shell router with in-MFE routing; base-path handling; links
that must resolve across apps.

**MFKit today:** `MFEContext.basePath` is the right primitive and it exists.
The gap is the link-resolution helper and dev-vs-prod origin handling. → **O8**

### 9. Auth and session sharing

Strong industry consensus: **centralize in the shell**, MFEs stay "dumb"
consumers of auth state and never own tokens or login flows.

**MFKit today:** nothing, and mostly correctly so — this is app-level. But it
is the single most-requested thing to pass through the host→MFE channel, which
makes it evidence for the parked state idea (`ideas.md` § 1), not a feature of
its own.

### 10. Organizational coordination

*"Routing, shared state, release timing… meetings multiplied instead of
shrinking."* Expected autonomy never materialized.

**Not a tooling problem.** Explicit non-goal. The most we should do is document
the precondition honestly.

### 11. The AI wildcard (new in 2026, cuts both ways)

Some teams are consolidating boundaries *specifically* to help coding agents —
scattered modules mean the agent scans more files, context bloats, it edits
regions it shouldn't. But the same literature argues the opposite remedy:
clear module boundaries, independent versioning, and explicit "work here, don't
touch there" are what let an agent scope a task safely.

**The deciding variable is whether the boundaries are machine-readable.**
Scattered-and-implicit boundaries hurt agents; declared-and-explicit ones help.
MFKit has a typed, validated, single-source manifest of exactly that. This is
the most defensible version of plan principle #5 ("AI tooling is tier-1") and it
is newly urgent. → **O5**

---

## Part 2 — Use cases that actually survive contact with production

| Use case | Why MF fits | MFKit fit |
|---|---|---|
| **Polyglot / incremental migration** — Angular→React, post-acquisition consolidation, gradual framework moves | The one thing a monolith genuinely *cannot* do. Ship a new-stack surface next to the old one without a rewrite | **Sharpest fit.** Five adapters, subpath isolation, a Svelte MFE that never installs React. This is our headline use case |
| **Enterprise SaaS** — admin, analytics, billing, onboarding at different cadences | Billing is stable, analytics ships weekly; one release train is waste | Strong. Budgets, healing, per-team autonomy |
| **E-commerce / composable commerce** — search, PDP, cart, checkout, account, recs | Classic: business domains change at genuinely different speeds | Strong. Checkout wants `strictStrategy()`, recs want forgiving — our pluggable healing maps exactly |
| **Banking / fintech** — accounts, transfers, loans, KYC, investments | Regulated domains need isolation and independent audit trails | Strong, and points at v0.4. A regulated flow must *refuse* a stale MFE, not silently degrade |
| **Marketplaces / vendor storefronts / plugin hosts** — third-party or per-vendor UI | Extensions are authored by people you don't control | **Distinct and underserved.** Untrusted-remote hosting needs quarantine + budgets + permissioning. Currently Piral's territory → **O6** |

**Pattern:** every surviving use case has *multiple business domains changing at
different rates*, or *code you don't own*. Neither is a team-size argument —
worth correcting in our own docs, since "we have lots of devs" is the reason
people adopt MFEs and then write the postmortem.

---

## Part 3 — What already exists, and the actual gap

| Tool | Owns | Doesn't |
|---|---|---|
| **Module Federation 2.0** | Bundler-level primitives, runtime composition, battle-tested at hundreds of remotes | Project-level convention. Ships primitives; you build the system |
| **single-spa** | Runtime orchestration, lifecycle contract, framework-agnostic | Scaffolding, config generation, dependency strategy |
| **Vercel Microfrontends / Turborepo** | Local dev proxy, routing, path resolution — genuinely good at Part 1 § 1 | Platform-coupled; vertical (whole-page apps) more than in-page composition |
| **Piral** | Opinionated plugin/pilet model for extensible ecosystems | Polyglot freedom; you adopt its model wholesale |
| **Nx** | Monorepo tooling, MF generators | Nx-coupled |
| **Zephyr Cloud** | MF deployment/hosting | Authoring-time DX |

**The gap MFKit sits in:** *polyglot, manifest-driven, bundler-agnostic,
self-healing, platform-neutral, AI-native.* Nobody currently offers "one config
→ every generated artifact + runtime resilience" across five frameworks without
buying into a platform or a hosting vendor.

**The threat to watch:** Vercel/Turborepo solving local dev well enough that DX
alone stops differentiating. Our durable moats are polyglot breadth, healing,
and the manifest-as-agent-context story — not ergonomics alone.

---

## Part 4 — Extracted opportunities, scored

Ordered by (pain frequency × alignment with core) ÷ effort. "Reuses" matters —
the best opportunities are mostly-built already.

### O1 — Selective local dev ("run one, proxy the rest") · **pain #1 · effort M**

Run the MFE you're working on locally; resolve every other remote from a
deployed dev/QA origin. Kills the laptop-melting problem and the polyrepo
coordination problem at once.

**Reuses:** manifest already carries `port` and `origin` per MFE; `deriveMFE`
already resolves origins with a `fallback-origin` inference source; Turbo
generation already knows every MFE's package name.
**Shape:** `mfkit dev --only=mfe-metrics` or a manifest-level `devMode`.
**Why it fits:** pure manifest derivation, no new source of truth, no runtime
opinion. Textbook invariant #3.

### O2 — Module-attributed telemetry hook · **pain #4 · effort S**

An optional `onEvent` sink on the healing runner emitting typed, *manifest-attributed*
events: load start/success/failure, retry with attempt count, quarantine,
version mismatch, mount duration.

**Reuses:** `healing/runner.ts` is already the single chokepoint and already
receives the `MFEManifestEntry`. This is genuinely a hook and a type.
**Why it fits:** answers "which remote broke, and why" — the exact thing
conventional APM can't. Also delivers most of L0 from `ideas.md` § 1 for free.
**Highest value-to-effort ratio on this list. Do this first.**

### O3 — Remote contract check in CI · **pain #5 · effort M**

Compare a built remote's *actual* exposed surface against what the host's
generated types expect; fail CI on breakage.

**Reuses:** `generateRemoteTypes` already derives host expectations;
`extractDefinition` (`react/controller.ts:198`) already knows what a valid
lifecycle looks like; `@mfkit/codemods` gives the migration story when the
contract legitimately changes.
**Why it fits:** turns "write contract tests yourself" into a manifest-derived
check. Nobody in this space ships it.

### O4 — Build/install-time singleton skew detection · **pain #2 · effort S–M**

Walk workspace `package.json` files, compare actual installed versions against
the manifest's `shared` block, report skew before it becomes a runtime mystery.
Must handle the version-postfix case that breaks MF's own singleton detection.

**Reuses:** `shared` manifest block; `healing/version.ts` verdict vocabulary
(`warn`/`throw`/`ignore`) applies unchanged; Turbo generation already reads
every package's `package.json` by path.

### O5 — Federation graph as machine-readable artifact + MCP · **pain #11 · effort M**

Emit the resolved graph (entries, versions, routes, budgets, live mount states)
as a typed artifact, then expose it over MCP.

**Reuses:** plan innovation #3 already promises this; O2's event stream is the
live half; the manifest is the static half.
**Why it fits:** directly answers the 2026 "MFEs hurt AI-assisted dev" critique
with *explicit machine-readable boundaries* — the thing the same literature says
agents actually need. Strategic, not just useful.

### O6 — Untrusted-remote host mode · **use case: marketplaces · effort L · v0.4**

Third-party MFEs get enforced budgets, mandatory quarantine thresholds,
permissioned mount context, and no implicit access to host internals.

**Reuses:** quarantine registry, `strictStrategy()`, budgets (once O7 lands),
`MFEContext` as the only sanctioned host→MFE channel.
**Why it fits:** the plugin-marketplace use case is real, underserved, and the
only one where our healing primitives are a *security* story rather than a
resilience story.

### O7 — Enforce the budgets we already declare · **pain #7 · effort S**

`budgetBytes` and `budgets` validate and then do nothing. Either enforce them
(measure built remote entries, fail or warn per mode) or delete the fields.

**Why it fits:** this is a correctness issue in our own surface, not a feature.
A declared-but-inert field is a promise we're currently breaking.

### O8 — Cross-app link/base-path helper · **pain #8 · effort S**

A manifest-derived resolver so an MFE can link to another MFE's route without
knowing its origin, correct in dev and prod.

**Reuses:** `MFEContext.basePath`, per-entry `route` and `origin`.
**Watch:** must stay a *resolver*, not a router — decision "no opinion on
routing" holds.

### Deferred, with reasons

- **State / event bus** — see `ideas.md` § 1. Note that pains #9 (auth) and #10
  (shared-state coordination) both point here; that's accumulating evidence, not
  yet a trigger.
- **Design tokens / enforced component usage** (pain #6) — governance, not
  tooling. The mechanical half is already fixed.

### Explicit non-goals

- **Team/org coordination** (pain #10). Architecture doesn't enforce itself and
  neither do we. Document the precondition; don't build for it.
- **Hosting, CDN, deployment platform.** Zephyr and Vercel own this. Staying
  platform-neutral *is* our position.
- **Being the design system.**
- **Being the router.**

---

## Recommended sequencing

1. **O2** (telemetry hook) — best ratio on the list, and it unlocks O5 and L0.
2. **O7** (enforce budgets) — closes a promise we're already making.
3. **O1** (selective dev) — largest felt pain, strongest DX story for v0.2.
4. **O4** (skew detection) — cheap, kills a whole class of debugging.
5. **O3** (contract check) → **O5** (graph + MCP) → **O6** (untrusted mode, v0.4).

Alongside, two docs that cost near-nothing and buy disproportionate trust:
**`when-not-to-use-mfkit.md`**, and a README repositioning around *polyglot /
incremental migration* as the headline use case rather than team scaling.

---

## Sources

- [We killed our micro-frontend project last quarter](https://dev.to/tahamjp/why-micro-frontends-failed-us-and-what-were-trying-next-43oo)
- [Micro-Frontends in 2026: Architecture Win or Enterprise Tax?](https://iocombats.com/blogs/micro-frontends-in-2026)
- [Micro Frontends in 2026: Engineering Maturity or Expensive Complexity?](https://medium.com/@mernstackdevbykevin/micro-frontends-in-2026-engineering-maturity-or-just-expensive-complexity-94de9f6d1b9e)
- [McKinsey — Need micro frontend benefits at scale? Reimagine the operating model](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/tech-forward/need-micro-frontend-benefits-at-scale-reimagine-the-operating-model)
- [5 Pitfalls of Using Micro Frontends](https://www.sitepoint.com/micro-frontend-architecture-pitfalls/)
- [Module Federation — Shared configuration](https://module-federation.io/configure/shared.html)
- [MF core #4078 — singletons fail with version postfixes](https://github.com/module-federation/core/issues/4078)
- [Why Enterprises Choose Module Federation (Zephyr Cloud)](https://zephyr-cloud.io/blog/module-federation-vs-native-esm)
- [Vercel — Microfrontends local development](https://vercel.com/docs/microfrontends/local-development)
- [Turborepo — Microfrontends guide](https://turborepo.dev/docs/guides/microfrontends)
- [The Tiny Proxy That Fixed Local Development for Our Multi-Repo Frontend](https://dev.to/subito/the-tiny-proxy-that-fixed-local-development-for-our-multi-repo-frontend-518b)
- [Runtime Observability in Micro-Frontend Architectures](https://ijetcsit.org/index.php/ijetcsit/article/view/759)
- [Datadog — Simplify micro-frontend observability with RUM](https://www.datadoghq.com/blog/simplify-micro-frontend-observability-with-datadog-rum/)
- [Versioning and Backward Compatibility in Micro Frontends (PDF)](https://eajournals.org/ejcsit/wp-content/uploads/sites/21/2025/05/Versioning.pdf)
- [Nx — What is Micro Frontend Architecture?](https://nx.dev/docs/kb/micro-frontend-architecture)
- [Exploring Micro Frontends: A Case Study in E-Commerce](https://arxiv.org/html/2506.21297v1)
- [Composable Commerce with Micro Frontends](https://commercelayer.io/blog/composable-commerce-with-micro-frontends)
- [How to scale CSS in micro frontends](https://blog.logrocket.com/scaling-css-in-micro-frontends/)
- [Frontend Architecture for AI Coding Agents](https://kayraberktuncer.medium.com/frontend-architecture-for-ai-coding-agents-monorepos-micro-frontends-and-rule-management-1f64b1fb9d88)
- [Micro Frontend Architecture: Module Federation, Single-SPA, Independent Deployment (2026)](https://smaple.tr/en/blog/micro-frontend-mimari-rehberi-en)
