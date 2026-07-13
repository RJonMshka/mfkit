# MFKit — Architecture

> How the pieces fit together, in plain language. Read alongside
> [`mfekit-plan.md`](./mfekit-plan.md) for the *why* of the phase work.

MFKit turns one declarative file — `mfkit.config.ts` — into a full polyglot
Module-Federation setup. Vite configs, Turbo pipelines, remote TypeScript
bindings, runtime mounting, and self-healing all read from that single manifest.

This document walks through every component, what it eats, what it returns,
and the wire it sits on.

---

## 30-second mental model

```
        ┌──────────────────────┐
        │   mfkit.config.ts    │  ← the only thing you author
        └──────────┬───────────┘
                   │ (MFKitConfig)
   ┌───────────────┼─────────────────────┬─────────────────┐
   │               │                     │                 │
   ▼               ▼                     ▼                 ▼
build-time     build-time            build-time         runtime
(Vite)         (Turbo)               (types)            (browser)
   │               │                     │                 │
mfkitMFE      generateTurbo     generateRemoteTypes   <MFKitOutlet>
mfkitShell    Config                 (.d.ts file)     + healing
   │               │                     │                 │
vite.config   turbo.json            remotes.d.ts       running app
```

Every arrow above reads the same `MFKitConfig` object. Nothing is hand-wired
twice. That is the load-bearing invariant — "manifest is the single source of
truth."

---

## The four packages

| Package | Role | Runtime side-effects |
|---|---|---|
| `@mfkit/plugin-api` | Type-only contract. One constant (`MFKIT_CONFIG_VERSION`). | None |
| `@mfkit/kit` | Everything that *does* something — config, vite, react, healing, turbo, types | Pure (no top-level effects) |
| `@mfkit/codemods` | Upgrade tooling. Schema migrations + `mfkit-migrate` CLI. | None until codemods register |
| `create-mfkit` | Scaffolder CLI (Phase 2 — not built yet) | — |

`@mfkit/plugin-api` is the contract layer. Every other package imports
**types** from it and never runtime code. That is how a Svelte-only consumer
avoids paying for React (and vice versa).

---

## Component map (with IO)

### 1. `@mfkit/plugin-api` — the contract

**Input:** none. **Output:** types you import.

It defines what an MFKit world looks like, and nothing more:

- `MFKitConfig` — the manifest shape (shell, mfes, shared, healing, …).
- `MFEDefinition` / `MFELifecycle` — `{ mount, unmount }` every MFE exposes.
- `MFEContext` — what MFKit injects into `mount(el, ctx, props?)`.
- `HealingStrategy` / `HealingDecision` — the rulebook for runtime failures.
- `FrameworkAdapter` — how a framework plugs into Vite + MF.
- `MFKitPlugin`, `DiscoveryStrategy`, `TemplateResolver` — extension points.
- `MFKitOutletPropsBase` — framework-agnostic outlet props.
- `MFKIT_CONFIG_VERSION` — the schema version codemods dispatch on.

**Value in the framework:** locks the public surface. Plugin authors, MFE
authors, and the kit runtime all program against the same shapes. Anything
breaking here bumps `MFKIT_CONFIG_VERSION` and ships with a codemod.

**Connects to:** everyone. Imports nothing.

---

### 2. `@mfkit/kit` (root entry) — `defineConfig` + `defineMFE`

**Input:**
- `defineConfig(config: MFKitConfig)` — your manifest object.
- `defineMFE(lifecycle: MFEDefinition)` — your MFE's `{ mount, unmount }`.

**Output:** the same object back, *validated*. On invalid input it throws
`MFKitConfigError` with every issue aggregated — path + message — so you fix
them all in one round-trip.

**What it does:**
1. Runs a [Valibot](https://valibot.dev) schema over the manifest. `looseObject`
   lets unknown keys pass so forward-compatible additions don't get dropped.
2. Checks cross-field invariants the schema can't: duplicate MFE name, port, or
   route.
3. Returns the same object (reference-equal — important for downstream
   memoization).

**Connects to:**
- `mfkit.config.ts` (the consumer) calls `defineConfig`.
- Each MFE's `lifecycle.ts` calls `defineMFE`.
- Every other kit subpath (`/vite`, `/turbo`, `/types`, `/react`) consumes the
  validated `MFKitConfig`.

---

### 3. `@mfkit/kit/vite` — build-time Vite config generation

**Input:** `MFKitConfig` + an MFE name (or "use the shell").
**Output:** a Vite `UserConfig` you can `return` from `defineConfig` in your
`vite.config.ts`.

Two helpers:

```ts
mfkitMFE(config, "mfe_metrics", opts?)  // → Promise<UserConfig> for one MFE
mfkitShell(config, opts?)               // → Promise<UserConfig> for the shell
```

**What it does (per call):**

1. **Find the entry.** `findMFE` matches the name; otherwise throws with the
   list of known names.
2. **Resolve the adapter.** `resolveAdapter("react" | "svelte" | …)`
   *dynamically* imports the framework's adapter chunk
   (`dist/vite-adapters/<framework>.js`). The dynamic import sits behind a
   function-wrapped path so esbuild can't inline it — that is what keeps
   subpaths tree-shakable. User-supplied adapters always win over built-ins.
3. **Derive defaults.** `deriveMFE` / `deriveShell` fill in what you didn't
   supply: port (adapter default → auto-assigned in `5173..5273`), exposes
   (`{ "./lifecycle": "./src/lifecycle.ts" }`), `remoteEntry.js`, and the
   composed `shared` map (`adapter.defaultShared` ← `config.shared` ←
   `entry.shared`, later keys win).
4. **Log inferred values.** In `dev` mode only, once per scope per process,
   `logInferred` prints a one-line `[mfkit] <name>: inferred defaults …` so
   nothing kit fills in is invisible.
5. **Lazy-load `@module-federation/vite`.** Same dynamic-import trick — kit
   doesn't import it eagerly, so a consumer running typecheck without the peer
   installed isn't blocked. If it's missing at build time, kit throws an
   `MFKitConfigError` with the install command.
6. **Assemble.** Returns `{ server, preview, build, plugins, optimizeDeps? }`.
   Framework plugins come first, then the federation plugin. You can `mergeConfig`
   your own overrides on top.

**Built-in adapters:**

| ID | Vite plugin | Default shared singletons |
|---|---|---|
| `react` | `@vitejs/plugin-react` | `react`, `react-dom` |
| `vue` | `@vitejs/plugin-vue` | `vue` |
| `svelte` | `@sveltejs/vite-plugin-svelte` | — |
| `angular` | `@analogjs/vite-plugin-angular` | `@angular/core`, `@angular/common` |
| `lit` | none — native ESM | — |

**Connects to:**
- Reads `MFKitConfig` from `mfkit.config.ts`.
- Reads adapter chunks lazily.
- Loads `@module-federation/vite` lazily.
- Output goes to Vite directly.

---

### 4. `@mfkit/kit/turbo` — Turbo pipeline generation

**Input:** `MFKitConfig` (+ optional cwd, schema URL, base task overrides).
**Output:** a `TurboConfig` JSON object. The function returns the shape;
*you* serialize and write it (no file I/O inside the kit). This keeps it
trivially unit-testable and lets consumers pick their wiring (postinstall
hook, build step, future `mfkit sync` CLI).

**What it does:**
1. Reads each `mfes[i].path` + `shell.path` `package.json` to learn the npm
   `name` field — Turbo addresses workspaces by name, but the manifest only
   carries the path. (Throws `MFKitConfigError` if a package.json is missing,
   unreadable, or has no `name`.)
2. Emits the base task block (`build`, `dev`, `test`, `typecheck`, `clean`).
3. Optionally emits `<shell-pkg>#dev` that `dependsOn` every `<mfe-pkg>#dev`
   so `turbo run dev` from the shell brings remotes up first. Pass
   `orchestrateShellDev: false` if your shell tolerates async startup.

**Why it exists:** the most boring possible reason — keeping `turbo.json`
hand-aligned with the manifest is a recurring foot-gun. The kit derives it
deterministically.

**Connects to:** reads `MFKitConfig` + filesystem. No bundler imports.

---

### 5. `@mfkit/kit/types` — federated remote type generation

**Input:** `MFKitConfig`.
**Output:** an ambient `.d.ts` file declaring every federated module the shell
can import.

For each MFE × each `exposes` key, it emits:

```ts
declare module "mfe_metrics/lifecycle" {
  import type { MFEDefinition } from "@mfkit/plugin-api";
  const lifecycle: MFEDefinition;
  export default lifecycle;
}
```

This is what lets the shell write `import lifecycle from "mfe_metrics/lifecycle"`
and have TypeScript typecheck — even when the remote hasn't been built yet.
That is the "placeholder when remote unavailable" surface promised in the plan.

Three functions:

| Function | What it does |
|---|---|
| `generateRemoteTypes(config, opts?)` | Pure. Returns the `.d.ts` string. Deterministic byte-for-byte. |
| `writeRemoteTypes(config, opts?)` | Writes to `.mfkit/generated/remotes.d.ts`. Skips when contents match (no spurious mtime churn). |
| `watchRemoteTypes(config, { watchPaths, reload })` | `fs.watch` wrapper. You supply `reload()` returning a fresh config; kit doesn't parse `mfkit.config.ts` itself. |

**Why kit doesn't parse the config file:** keeps "manifest is the SoT"
decoupled from how the manifest is *authored*. TS, JS, JSON, generated —
all work, because you hand kit a plain object.

**Connects to:** reads `MFKitConfig`, writes one file. No bundler imports.

---

### 6. `@mfkit/kit/healing` — runtime self-healing

**Input:** an operation (`() => Promise<T>`), the failing MFE's manifest
entry, and a `HealingStrategy`.
**Output:** either the operation's result, or a structured error
(`MFEHealingError` / `MFEQuarantinedError`).

This is where every "what happens when an MFE fails" answer lives. It is the
*only* surface where kit is allowed to swallow errors — and even then, only
because the active strategy said so.

**Pieces:**

```
runWithHealing  ←─ the orchestrator
   ├─ HealingStrategy.onLoadError  ─→ retry | quarantine | fail
   ├─ HealingStrategy.onMountError ─→ retry | quarantine | fail
   └─ HealingStrategy.maxAttempts  ─→ safety net (force quarantine)

QuarantineRegistry ←─ "give up on this MFE" state, shared across outlets
forgivingStrategy() ←─ default: retry + exponential backoff, then quarantine
strictStrategy()    ←─ enterprise: fail fast on first error

checkSingletonVersion ←─ singleton react/vue/etc. mismatch handler
createManifestCache   ←─ last-known-good fallback for the MF manifest
```

**`runWithHealing` algorithm:**

1. Quarantined already? Throw `MFEQuarantinedError` immediately. The rest of
   the app keeps running.
2. Run the op. Success → return.
3. Failure → ask the strategy. Decision:
   - `{ action: "retry", afterMs }` → wait (abortable), increment counter, loop.
   - `{ action: "quarantine" }` → mark in the registry, throw.
   - `{ action: "fail", reason }` → throw `MFEHealingError`.
4. Hard safety net: when `attempt > strategy.maxAttempts`, force quarantine
   so a misbehaving strategy can't infinite-loop.

**Connects to:**
- `<MFKitOutlet>` (via the React-side controller) runs both `load` and `mount`
  through it.
- Consumers can swap the default strategy via `MFKitConfig.healing`,
  `<MFKitProvider strategy>`, or the per-outlet `healing` prop — three nesting
  levels of override.

---

### 7. `@mfkit/kit/react` — `<MFKitOutlet>` + `<MFKitProvider>`

**Input (provider):** `loadRemote` (typically `loadRemote` from
`@module-federation/enhanced/runtime`), optional `strategy`, `registry`, and
`entries` (manifest entries the provider knows about).
**Input (outlet):** `remote` (the MF name), plus optional `module`, `basePath`,
`props`, `entry`, slot fallbacks, and per-instance overrides.
**Output:** a React element that owns one MFE's mount/unmount lifecycle.

**The split:**

```
<MFKitProvider>  ←─ supplies host-wide defaults (loader, strategy, registry, entries)
   └── <MFKitOutlet remote="mfe_metrics" />
          ↓
       createOutletController()  ←─ pure, framework-agnostic engine
          ↓
       runWithHealing({ op: loadRemote(...) })   ─→ MFEDefinition
       runWithHealing({ op: definition.mount(...) })  ─→ mounted
```

**Why the controller is separate from the React component:** the load → mount
→ unmount cycle is imperative state with cancellation, generation counting,
and abort signals. Keeping it in `createOutletController` (zero React imports)
makes it directly testable and reusable for future Vue/Svelte outlets.

**State the outlet renders:**

- `idle` / `loading` → `loadingFallback` slot (default: simple spinner text)
- `retrying` → `retryingFallback` slot (shows attempt number + countdown)
- `mounted` → renders the MFE itself; overlay slots hide
- `quarantined` → `quarantinedFallback` slot with `retry()` to lift it
- `error` → `errorFallback` slot with `retry()` to re-run the cycle

All four slots accept either a `ReactNode` or a `(info) => ReactNode`
function.

**`loadRemote` is injected, not imported.** Kit does not depend on the MF
runtime. You hand it `loadRemote` from `@module-federation/enhanced/runtime`
(or any function with the same shape). That keeps the kit usable with any MF
runtime — including future ones.

---

### 8. `@mfkit/codemods` — upgrade tooling

**Input:** future codemod authors call `registerCodemod({...})`. CLI users run
`mfkit-migrate up --from N --to N`.
**Output:** today, the registry is empty by design — Phase 1 ships only the
scaffolding. First real migration lands at v0.3+.

**Shape of a codemod:**

```ts
interface CodemodManifest {
  readonly id: string;                  // unique slug
  readonly description: string;
  readonly fromVersion: number;         // schema version this migrates from
  readonly toVersion: number;           // must equal fromVersion + 1
  apply(ctx: MigrationContext): Promise<MigrationResult> | MigrationResult;
}
```

The `toVersion === fromVersion + 1` invariant is load-bearing. Multi-step
jumps compose by chaining single-step codemods — keeps each migration small
and individually auditable. The planner walks one step at a time and
**refuses** to plan a path with a gap or with two codemods covering the same
step. No silent winner-picking.

**CLI (`mfkit-migrate`):**

| Command | What it does |
|---|---|
| `list` | Prints every registered codemod with its version step. |
| `plan --from N --to M` | Shows which codemods *would* run. |
| `up --from N --to M [--dry-run]` | Runs them in order; `--dry-run` reports without writing. |

**Connects to:** reads `MFKIT_CONFIG_VERSION` from `@mfkit/plugin-api`. That
is the version codemods dispatch on.

---

## The full lifecycle (end-to-end)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          author time                                  │
│                                                                       │
│  mfkit.config.ts                                                      │
│    ├─ defineConfig({...})  → validated MFKitConfig                   │
│    └─ (one per repo)                                                  │
│                                                                       │
│  apps/mfe-*/src/lifecycle.ts                                          │
│    └─ defineMFE({ mount, unmount })  → MFEDefinition                 │
└────────────────────┬──────────────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────────────┐
│                          build time                                   │
│                                                                       │
│  apps/mfe-*/vite.config.ts        │  apps/shell/vite.config.ts        │
│    mfkitMFE(config, "mfe_x")      │    mfkitShell(config)             │
│         ↓                         │         ↓                         │
│    framework adapter +            │    framework adapter +            │
│    @module-federation/vite        │    @module-federation/vite        │
│    (per-MFE expose: lifecycle)    │    (remotes map for all MFEs)     │
│                                                                       │
│  turbo.json   ← generateTurboConfig(config)                          │
│  remotes.d.ts ← writeRemoteTypes(config)  (watcher in dev)           │
└────────────────────┬──────────────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────────────┐
│                           runtime                                     │
│                                                                       │
│  <MFKitProvider loadRemote={mfRuntime.loadRemote}                    │
│                 strategy={forgivingStrategy()}                        │
│                 entries={config.mfes}>                                │
│                                                                       │
│    <Route path="/metrics">                                            │
│      <MFKitOutlet remote="mfe_metrics" />                            │
│        ↓                                                              │
│      createOutletController()                                         │
│        ↓                                                              │
│      runWithHealing(op = loadRemote("mfe_metrics/lifecycle"))        │
│        → on fail: strategy.onLoadError → retry | quarantine | fail   │
│        ↓                                                              │
│      definition = extracted from module                              │
│        ↓                                                              │
│      runWithHealing(op = definition.mount(container, ctx, props))    │
│        → on throw: strategy.onMountError → retry | quarantine | fail │
│        ↓                                                              │
│      mounted. onMount fires. slot overlay hides.                     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Three nesting levels of override

A lot of MFKit's "smart but not bossy" feel comes from this nesting: any
strategy you set wins over the level above it.

| Level | Where you set it | Scope |
|---|---|---|
| 1. Config | `MFKitConfig.healing` | Process-wide default |
| 2. Provider | `<MFKitProvider strategy>` | All outlets in a subtree |
| 3. Outlet | `<MFKitOutlet healing>` | This one mount |

Same pattern for `loadRemote`, `quarantineRegistry`, and `entries`.

---

## What is *not* in the framework

Worth knowing what MFKit deliberately doesn't do:

- **Doesn't parse `mfkit.config.ts`.** You import it; kit reads the object.
- **Doesn't bundle Module Federation.** `@module-federation/vite` is an
  optional peer; kit lazy-loads it.
- **Doesn't lock you to React.** Only `@mfkit/kit/react` pulls React. Svelte,
  Vue, Lit, Angular MFEs work today; future Vue/Svelte outlets would be new
  subpaths.
- **Doesn't pick winners.** When two codemods cover the same version step,
  the planner throws. When a strategy returns conflicting decisions over time,
  the safety net forces quarantine.
- **Doesn't fail-fast by default.** The default strategy is *forgiving*: the
  app keeps running with fewer MFEs rather than refusing to boot. Swap in
  `strictStrategy()` if your context demands the opposite.

---

## Files map (quick reference)

```
packages/plugin-api/src/
  index.ts            ← re-exports the union
  manifest.ts         ← MFKitConfig, MFEManifestEntry, ShellConfig, …
  lifecycle.ts        ← MFEDefinition, MFEContext
  framework-adapter.ts ← FrameworkAdapter<Plugin>
  healing.ts          ← HealingStrategy, HealingDecision
  discovery.ts        ← DiscoveryStrategy
  templates.ts        ← TemplateResolver
  plugin.ts           ← MFKitPlugin
  outlet.ts           ← MFKitOutletPropsBase

packages/kit/src/
  index.ts            ← defineConfig, defineMFE, MFKitConfigError
  vite.ts             ← mfkitMFE, mfkitShell
  vite/derive.ts      ← deriveMFE/deriveShell (pure, no Vite import)
  vite/adapter-resolve.ts ← lazy dynamic-import dispatch
  vite/inference-log.ts   ← one-shot dev console log
  vite/vite-adapters/*.ts ← built-in adapters (lazy chunks)
  healing.ts          ← public healing surface
  healing/strategies.ts   ← forgivingStrategy, strictStrategy
  healing/runner.ts       ← runWithHealing
  healing/quarantine.ts   ← QuarantineRegistry
  healing/version.ts      ← checkSingletonVersion
  healing/manifest-cache.ts ← createManifestCache
  react.ts            ← public React surface
  react/outlet.tsx        ← <MFKitOutlet>
  react/provider.tsx      ← <MFKitProvider>
  react/controller.ts     ← framework-agnostic engine
  react/default-slots.tsx ← built-in loading/error/etc. UIs
  react/error-boundary.tsx
  react/types.ts          ← OutletState, slot info types
  turbo.ts            ← generateTurboConfig
  types.ts            ← types subpath public surface
  types/generate.ts       ← generateRemoteTypes (pure)
  types/write.ts          ← writeRemoteTypes (idempotent)
  types/watch.ts          ← watchRemoteTypes (fs.watch)

packages/codemods/src/
  index.ts            ← public surface
  registry.ts         ← CodemodManifest, registerCodemod, planMigration
  cli.ts              ← mfkit-migrate CLI
```
