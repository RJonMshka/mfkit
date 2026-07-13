# MFKit — Framework Extraction Plan

> Living document. Captures the decision to split DevNexus into a framework
> (MFKit) and a canonical example (this repo), and the Phase 1 work plan to get
> there. Read alongside `architecture.md` and `PLAN.md` (DevNexus's own roadmap).

## Vision

DevNexus today is a production-grade **reference architecture** for polyglot
Module Federation. The goal is to extract its framework surface into **MFKit** —
a scaffolder + runtime + plugin system + AI tooling bundle — that lets others
spin up the same architecture with one command, plug in MFEs with minimum
config, and upgrade well over time.

DevNexus stays as the **canonical example app** built *with* MFKit, doubling as
its living integration test.

## Audience progression

Innovation-first, not "fit into existing patterns." Designed to grow with the
audience:

1. **Developers experimenting** (v0.1) — fast scaffold, smart defaults, instant gratification
2. **Agencies shipping** (v0.2–v0.3) — upgrade tooling, opinionated conventions, AI tooling productivity wins
3. **Enterprise teams** (v0.4+) — pluggable healing strategies, lockdown modes, governance

The architecture must be **smart, self-healing, adaptable by design** — these
are not features bolted on later; they constrain every layer from day one.

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Name | `MFKit` | Descriptive, MF-focused, short |
| npm scope | `@mfkit/*` | Standard scoped package layout |
| License | MIT | Maximize reach |
| Repo strategy | Split — `mfkit` (framework) + `devnexus` (example) | Framework and example are now two products |
| Bootstrap order | Extract while DevNexus stays working (no fork) | Safer; DevNexus is the integration test from day one |
| Monorepo tools | pnpm workspaces + Turbo | Same as DevNexus; familiar |
| Versioning | Independent semver per `@mfkit/*` package via Changesets | Templates can move faster than kit; plugin API moves slowest |

## Architecture — five pluggable layers

```
1. create-mfkit              CLI scaffolder
2. @mfkit/kit                Runtime + config generators + self-healing
3. @mfkit/plugin-api         Plugin contract types
4. @mfkit/template-*         Per-framework MFE templates (React/Svelte/Vue/Angular/Lit + community)
5. @mfkit/codemods           Upgrade tooling (infra v0.1, codemods v0.3+)
```

Every layer is replaceable via plugin API. Discovery strategies, template
resolvers, runtime loaders, healing strategies — all swappable.

## Core principles

1. **Convention with smart inference, not enforcement.** Kit detects, proposes,
   applies. Never silently fails, never rigidly demands.
2. **Every layer is pluggable.** Lock the plugin API surface; iterate freely behind it.
3. **Self-healing is runtime, not just install-time.** Failures degrade gracefully;
   the system keeps running with fewer MFEs rather than refusing to boot.
4. **Templates are first-class citizens.** Versioned, distributable via npm AND
   git AND local path. Our 5 MFEs are reference templates, not hardcoded internals.
5. **AI tooling is tier-1.** Skills, commands, sub-agents, MCPs ship as part of the
   scaffold — not a side project.

## Self-healing surfaces (architectural)

| Failure mode | Self-heal behavior |
|---|---|
| MFE fails to mount | Boundary catches → retry w/ backoff → quarantine → rest of app works |
| Singleton version skew | Install-time + runtime detection → actionable error w/ codemod suggestion |
| Port conflict on dev | Auto-reassign + update manifest + notify shell |
| Missing federation type | Watcher regenerates on save; shell uses placeholder until ready |
| Broken `remoteEntry.js` | Cache last-known-good manifest → degraded mode w/ banner |
| New MFE folder added | Detected, auto-registered (with confirmation in dev) |
| Framework template drift | Kit detects, surfaces upgrade path, never auto-applies |

## Repo split

### `mfkit` (new OSS repo)

```
mfkit/
├── packages/
│   ├── cli/                  → npm: create-mfkit, mfkit
│   ├── kit/                  → npm: @mfkit/kit             (runtime + config generators)
│   ├── plugin-api/           → npm: @mfkit/plugin-api      (types only, stable surface)
│   ├── template-react/       → npm: @mfkit/template-react
│   ├── template-svelte/      → npm: @mfkit/template-svelte
│   ├── template-vue/         → npm: @mfkit/template-vue
│   ├── template-angular/     → npm: @mfkit/template-angular
│   ├── template-lit/         → npm: @mfkit/template-lit
│   └── codemods/             → npm: @mfkit/codemods         (v0.3+, infra ships in v0.1)
├── examples/
│   └── minimal/              → smoke-test, 2 MFEs, used in CI
├── docs/
│   ├── getting-started.md
│   ├── plugin-api.md
│   ├── self-healing.md
│   └── adr/
├── .changeset/
└── README.md
```

Tagline: *"Polyglot Module Federation, scaffolded and self-healing."*

### `devnexus` (this repo, refactored)

Consumes `@mfkit/*` as dependencies. The framework-surface code (MF Vite configs,
lifecycle plumbing, error boundaries with retry) moves to MFKit. Domain code
stays.

```
devnexus/
├── apps/                     ← 6 MFEs unchanged in scope; each uses defineMFE()
├── packages/
│   └── shared/               ← @devnexus/shared (domain, stays here)
├── devnexus.config.ts        ← single source of truth, consumed by @mfkit/kit
├── .claude/                  ← AI tooling (promoted to MFKit scaffold later)
└── docs/
```

### What goes where

| Code | Lives in | Why |
|---|---|---|
| MF Vite config generators | MFKit | Framework's core job |
| `defineMFE()` contract types | MFKit | Public API |
| MFE error boundaries / retry | MFKit | Self-healing primitive |
| `@devnexus/shared` (auth, events, store) | DevNexus | Domain logic |
| EventBus *pattern* | MFKit docs | Pattern, not impl |
| EventBus impl | DevNexus | Specific to this app |
| `.claude/` skills (mf, frontend-architect, code-quality, etc.) | MFKit scaffold | Ships with `create-mfkit` |
| `.claude/` agents specific to DevNexus | DevNexus | Domain-specific |
| Performance budgets enforcement | MFKit | Generic capability |
| Specific budget *values* (180KB, etc.) | DevNexus config | Project decision |

## Phase roadmap

### v0.1 — Foundation (Phase 1)

- `create-mfkit` CLI with 5 official templates → **deferred to v0.1 ship, built in Phase 2**
- `@mfkit/kit` with pluggable discovery + runtime + self-healing primitives
- `devnexus.config.ts` schema v1 (locked, versioned)
- Plugin API surface formalized
- DevNexus running entirely through MFKit
- Codemod infrastructure exists (no actual codemods)
- `.claude/` bundle prototyped in DevNexus, not yet generalized

**Exit criteria:** DevNexus runs unchanged but framework code lives in MFKit alpha packages.

### v0.2 — Scaffolding & ergonomics

- `create-mfkit` CLI ships
- `mfkit add mfe --framework=<x> --route=<y>` incremental MFE addition
- External template registry support (npm tag `mfkit-template` discovery)
- Federation introspection MCP

### v0.3 — Upgrade tooling

- `mfkit upgrade` with real codemods
- v0.1 → v0.3 migration as proof-of-concept
- Codemod authoring guide

### v0.4+ — Enterprise

- Healing strategy plugins (lockdown vs. forgiving)
- Governance: pinned versions, allowed framework set
- Bundle budget enforcement modes

## Innovation moves (worth calling out)

1. **AI-first dev loop.** New MFE folder appears → sub-agent verifies singleton
   compat, runs budget check, proposes route. No other MF framework treats AI
   tooling as a tier-1 surface.
2. **Manifest-driven everything.** Single `devnexus.config.ts` + per-MFE
   `defineMFE()` is the *only* source of truth. Vite, Turbo, type bindings,
   route maps derived. Hand-edits are escape hatches.
3. **Federation graph as runtime API.** Kit exposes live MFE graph (versions,
   sizes, mount states) to shell and Claude (via MCP). Self-healing decisions
   are graph-informed.
4. **Healing strategies as plugins.** Defaults forgiving (experimenters);
   enterprises lock down by swapping plugin.

---

## Phase 1 — Detailed work plan

**Principle:** every step ends with DevNexus still running. No fork. Each work
unit is its own commit boundary.

### Step 0 — Setup (no DevNexus changes)

MFKit (new repo):

- pnpm workspaces + Turbo (same toolchain as DevNexus = familiar)
- TypeScript strict + `noUncheckedIndexedAccess`
- Vitest, Changesets, GitHub Actions (lint/typecheck/test/build)
- MIT LICENSE in repo root + each `package.json`
- Skeleton `packages/` directory, README with tagline

Cross-repo dev linkage: `pnpm link --global` from MFKit packages → DevNexus.
Easy to reset, no `file:` drift.

### Step 1 — Lock the public surface (types only)

MFKit: `packages/plugin-api/src/index.ts` — TS types only:

- `MFKitConfig`, `MFEDefinition`, `MFELifecycle`
- `FrameworkAdapter`, `DiscoveryStrategy`, `HealingStrategy`, `TemplateResolver`

Publish `@mfkit/plugin-api@0.0.1-alpha.0`.

**Why first:** the contract everything else implements. Cheapest to lock; most
expensive to change later.

### Step 2 — `@mfkit/kit` skeleton

MFKit: `packages/kit/` — `defineConfig()` and `defineMFE()` as validated
pass-throughs (Zod or Valibot at the boundary — TBD). Re-export types. Publish
alpha.

Exit: kit installable, validates input shape, otherwise no-op.

### Step 3 — Wire DevNexus to consume kit (inert)

DevNexus:

- Add `@mfkit/kit` + `@mfkit/plugin-api` via `pnpm link`
- Create `devnexus.config.ts` at root with full `defineConfig({...})` —
  declarative manifest of all 6 MFEs
- Config exists but drives nothing yet

Exit: `pnpm dev` runs unchanged. Manifest is real but inert.

### Step 4 — Extract MF Vite config generation (the big one)

MFKit: `@mfkit/kit/vite` — `mfkitVite(manifest)` generates MF Vite config from
`MFEDefinition`. Framework adapters internally:

- React: `@module-federation/vite`
- Svelte / Vue / Lit: same plugin, different framework integrations
- Angular: `@analogjs/vite-plugin-angular` (per existing memory — `CLAUDE.md`
  is outdated on this; do not "correct" to native-federation)

DevNexus migration order (least risk first):

1. `mfe-config` (Lit, smallest, isolated) — also validates the standard
   `"./lifecycle"` expose-key path (the `"././"` workaround referenced in older
   memory is obsolete; all current MFEs use plain `"./lifecycle"`).
2. `mfe-ai` (React shared, exercises singleton path)
3. `mfe-metrics` (Svelte)
4. `mfe-incidents` (Vue)
5. `mfe-api` (Angular — hardest, different toolchain)
6. `shell` (last — its config references all the others)

Each MFE = one commit. Hand-written `vite.config.ts` deleted after migration.

Exit: All Vite configs generated. Build artifacts byte-comparable (or diffed
and explained).

### Step 5 — `defineMFE()` lifecycle migration

DevNexus: Each MFE's current `lifecycle.ts` wraps existing mount/unmount in
`defineMFE({...})`. Zero behavior change — just stamps the contract.

Exit: All MFEs uniformly conform to the plugin contract.

### Step 6 — Shell uses `<MFKitOutlet>`

MFKit: `@mfkit/kit/react` exports `<MFKitOutlet>` — generalizes DevNexus's
current `MFEOutlet`. Plugin slot for custom error UI, retry policy, loading
state.

DevNexus: Shell's hand-rolled outlet → replaced. Existing error boundary becomes
a prop.

Exit: Shell mounting flows through kit.

### Step 7 — Self-healing primitives

MFKit: Move into kit, all pluggable via `HealingStrategy`:

- Retry with exponential backoff
- Quarantine after N failures
- Runtime singleton version check (warns/throws based on strategy)
- Federation manifest validation w/ last-known-good cache

DevNexus: Uses default strategy. Behavior matches today's after migration.

Exit: "Self-healing" is a real surface in kit, not just docs.

### Step 8 — Federated remote type generation

MFKit: Watcher in kit emits `.d.ts` for each MFE's exposed surface. Shell
imports remote types cleanly.

DevNexus: Hand-maintained remote type declarations deleted.

Exit: Types regenerate on save; placeholder types when remote unavailable.

### Step 9 — Turbo pipeline generation

MFKit: `generateTurboConfig()` consumed via postinstall hook or explicit
`mfkit sync`.

DevNexus: Hand-written `turbo.json` MFE entries replaced.

Exit: Adding/removing an MFE requires only a `devnexus.config.ts` edit.

### Step 10 — Codemod infrastructure (no actual codemods)

MFKit: `packages/codemods/` skeleton. `mfkit migrate` CLI stub. Version-manifest
format defined. Zero codemods registered.

**Why now:** "adaptable by design" requires the plumbing to exist before v0.1
ships. Migrations from 0.1 → 0.2 land later, but the registry/schema is locked
now.

### Phase 1 exit criteria

- DevNexus runs entirely through `@mfkit/kit`
- Hand-written MF Vite configs deleted from DevNexus
- `@mfkit/plugin-api`, `@mfkit/kit`, `@mfkit/codemods` published as `0.x-alpha`
- Self-healing primitives in kit
- No CLI scaffolder yet (Phase 2)
- No external templates yet (Phase 2)
- No `.claude/` bundling yet (Phase 5)

---

## Open setup questions (blocking only Step 0)

1. **GitHub:** new org (e.g., `mfkit-dev`) or under personal account?
2. **Repo path on disk:** sibling `/Users/rajatkumar/Desktop/Projects/mfkit/` OK?
3. **Publishing during Phase 1:** real npm publish (alpha tag) or local-only via
   Verdaccio until Phase 1 lands?
4. **Validation library:** Zod (heavier, well-known) or Valibot (smaller,
   tree-shakable) for runtime config validation in kit?

## Trade-offs to revisit

1. **Convention vs. legibility.** Auto-generation makes scaffolding ergonomic
   but hides what makes DevNexus teaching-valuable. Mitigation: kit emits a
   `.mfkit/generated/` folder users can read; nothing is hidden at runtime,
   just not hand-written.
2. **AI tooling lock-in to Claude Code.** Bundle assumes Claude Code is the
   user's IDE. Mitigation: skills/agents are optional; CLI works standalone.
3. **Maintenance surface explodes.** Five frameworks × N versions × M codemods
   is a real burden. Mitigation: pin supported framework versions per MFKit
   major; bump together.
4. **Template registry needs hosting.** Git-based (clone from GitHub) simplest;
   npm-published templates versioned but heavier. Decision: support both.
5. **Codemods are brittle.** Plan to invest 40% of total effort in Phase 4, or
   accept "manual upgrade guide" downgrade in v1.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Over-generalizing from one example | Wait for second non-DevNexus consumer before abstracting |
| Plugin API churn pre-v1 | Lock surface in Step 1; iterate behind it |
| DevNexus regressions during extraction | Each step ends with working app; full E2E + visual regression suites |
| MFKit alpha breaking DevNexus | Pin DevNexus to exact `@mfkit/*` versions |
| Scope creep into v0.1 | Defer CLI, codemods, AI bundle to later phases — explicit no-goes above |
