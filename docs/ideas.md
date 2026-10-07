# Parked ideas

> Things worth building that are **not** scheduled. Each entry records the
> idea, why it's parked, what would unpark it, and what we already know so the
> thinking isn't redone from scratch. Nothing here is a commitment.
>
> An idea graduates by becoming an ADR in `design-decisions.md` plus a step in
> `mfekit-plan.md` — not by someone quietly starting it.

---

## 1. Composition state framework

**Parked 2026-08-04.** Revisit no earlier than v0.2.

### The idea

MFKit grows a state layer: cross-MFE communication, a shared store with
declared topology (centralized / decentralized / hybrid), the ability to
capture "the app at a point in time," and transitions between those points.

### The line that makes it viable

**MFKit owns state that crosses the MFE boundary, and nothing inside it.**

Inside an MFE: Redux, Zustand, Svelte stores, Angular services — kit has no
opinion, and the polyglot promise dies the moment it does. At the seam: kit
owns the contract, transport, observability, and healing behavior. Only kit
sees every mount, so only kit *can* own the seam.

The failure mode to avoid is kit drifting toward being the state manager
*inside* MFEs. That fights five framework ecosystems at once and violates
"convention, never enforcement."

### Why it's parked

It reverses a written decision — `design-decisions.md` § "What we don't commit
to" says kit ships no EventBus, store, or context. Reversal needs an ADR, not
drift. And none of it is in Phase 1's exit criteria.

### What would unpark it

A real consumer hitting the problem — two MFEs in `examples/minimal` or
DevNexus that genuinely need to share state, where the app-level workaround is
visibly worse than a kit-level contract. Absent that, this is speculative
generality (the exact risk the plan's own risk table warns about).

### Prior thinking worth keeping

**This is mostly consolidation, not invention.** The ingredients already exist,
just scattered:

- `OutletState` (`packages/kit/src/react/types.ts:21`) — per-mount lifecycle,
  already a discriminated union
- `QuarantineRegistry.snapshot()` (`packages/kit/src/healing/quarantine.ts:16`)
  — already a point-in-time map
- the manifest — the static composition graph
- `MFEContext` (`packages/plugin-api/src/lifecycle.ts`) — already the host→MFE
  injection channel, handed to `mount` at `react/controller.ts:127`
- plan innovation #3 already promises "federation graph as runtime API"

**Three layers, independently useful, ship in order:**

- **L0 — composition state (read-only).** One observable `CompositionSnapshot`:
  which MFEs exist, which are mounted / loading / retrying / quarantined, at
  what versions, on what routes. This is *kit's own* state, not app state, so
  it doesn't touch the "no state opinion" stance at all. Near-zero design risk.
  Overlaps heavily with the observability opportunity in `mfe-landscape.md`
  (§ O2) — if that ships, L0 is most of the way built.
- **L1 — boundary state.** A `StateStrategy` contract in plugin-api, default
  impl in `@mfkit/kit/state`, **injected through `MFEContext`, never imported
  by MFEs from a shared package.** Import-based sharing walks straight into
  singleton version skew; injection sidesteps it and matches decision #9
  (`loadRemote` is injected) and #8 (framework-free core, thin bindings).
  Slices namespaced per MFE, declared visibility, structured-cloneable only.
- **L2 — time and transitions.** Snapshot/restore over L0+L1, transition log,
  replay. Deterministic e2e seeding, real debugging surface.

**Two connections specific to this codebase — these are the differentiators:**

- **State × healing.** Today a quarantined MFE just vanishes. With L1 its slice
  survives quarantine and rehydrates on successful retry. We already cache a
  last-known-good *manifest*; a last-known-good *snapshot* is the same idea one
  level up.
- **State × codemods.** An MFE at v2 reading a slice written by v1 is exactly
  what `planMigration` (`packages/codemods/src/registry.ts:116`) already solves
  — single-step, gap-free, ambiguity-free. Versioned state slices with
  migrations, reusing tested machinery.

**Topology falls out of injection for free.** The shell constructs the store, so
topology is a shell decision, not three implementations: one store with
namespaced slices (hybrid — local by default, shared where declared) is the
default; "declare everything shared" is centralized; per-MFE stores plus the
event channel is decentralized. One contract, three configurations.

**Contract cost is low.** `MFEContext` is host-provided and MFEs only read it;
`MFKitConfig.state` would be optional. Both additive → no `MFKIT_CONFIG_VERSION`
bump, no codemod. `@mfkit/kit/state` must be pure (no React, no Vite) with
bindings in `/react`; `tests/vite/subpath-isolation.test.ts` enforces that
automatically.

### Honest limits

Kit can only ever snapshot what MFEs **voluntarily publish**. A `useState`
inside an MFE is invisible and always will be. So this is *composition +
published boundary state*, never "total app state" — if that boundary gets
fuzzy in the docs it becomes a lie the first time someone tries to time-travel
a form. Serialization must be enforced at the boundary (structured-clone only)
or snapshots silently stop being snapshots.
