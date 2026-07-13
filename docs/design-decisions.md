# MFKit — Design Decisions

> Why MFKit is shaped the way it is. Each decision below has a *because*
> attached — most of them tie back to keeping the framework smart but not
> bossy, and to letting one consumer's choices not balloon into everyone
> else's bundle.

---

## 1. The manifest is the single source of truth

**Decision:** every generated artifact — Vite configs, Turbo pipelines, route
maps, federated remote `.d.ts` — is derived from `mfkit.config.ts`. Hand-edits
to those artifacts are escape hatches, not the norm.

**Why:** in a polyglot MF setup, the things that *must* agree across packages
(MFE name, port, exposes, remote URL, shared singletons) drift the moment two
people touch them in two places. One source of truth means adding an MFE is a
config edit + a folder — never an edit in five places.

**How it shows up in code:**
- `defineConfig()` validates the manifest at the boundary.
- `mfkitMFE()` / `mfkitShell()` derive the Vite config from it.
- `generateTurboConfig()` derives the Turbo pipeline from it.
- `generateRemoteTypes()` derives the ambient `.d.ts` from it.
- `<MFKitProvider entries={config.mfes}>` plumbs it to the runtime.

**Edge case that almost broke this:** Turbo addresses workspaces by their
npm `name`, which the manifest doesn't carry (the manifest has `path`). The
choice was: (a) add `name` to the manifest, or (b) read each package.json by
path. We picked (b). Adding `name` would have introduced a second source for
something that already exists in package.json — and a second place for it to
drift.

---

## 2. `@mfkit/plugin-api` is types-only

**Decision:** the contract package exports types and exactly one runtime
constant (`MFKIT_CONFIG_VERSION`). No schemas, no helpers with function
bodies, no Zod/Valibot. All validation lives in `@mfkit/kit`.

**Why:** the contract is the cheapest thing to lock now and the most
expensive thing to change later. The smaller its runtime footprint, the
fewer reasons it has to break. Type-only also means `sideEffects: false`
trivially holds — no top-level code can ever sneak in.

**Consequence:** breaking the surface is loud. Removing or renaming an
exported symbol, narrowing a parameter, changing field optionality —
all require bumping `MFKIT_CONFIG_VERSION` and registering a codemod.

---

## 3. Subpath isolation (kit is tree-shakable per concern)

**Decision:** `@mfkit/kit` exposes one root entry plus subpaths
(`/vite`, `/react`, `/healing`, `/turbo`, `/types`). A Svelte-only consumer
must not pay for React; a CI tool calling `generateTurboConfig` must not
need Vite installed.

**Why:** polyglot is the point. If using kit forced everyone onto the
React install graph, the "swap a framework freely" pitch dies.

**How it's enforced:**
- `peerDependencies` for React, Vite, every framework Vite plugin, and
  `@module-federation/vite` are all **optional**.
- All bundler/UI imports happen *lazily* — runtime imports inside functions,
  never at module top level.
- Framework adapters live in their own tsup entries
  (`dist/vite-adapters/*.js`) and are loaded through a function-wrapped
  dynamic import so esbuild can't inline them.
- `tests/vite/subpath-isolation.test.ts` reads built `dist/*.js` and asserts
  no framework peer is statically imported in the wrong subpath. This is the
  contract — not a code-style check.

---

## 4. Valibot over Zod for runtime validation

**Decision:** kit validates `MFKitConfig` with Valibot, not Zod.

**Why:**
- Smaller bundle (Valibot ships about 5kB min+gz against Zod's ~13kB).
- Tree-shakable by design — matches kit's `sideEffects: false` story.
- Schema shape is simple at our boundary; we don't need Zod's wider feature set.

**Trade-off:** Zod is more familiar. Valibot's syntax (`v.pipe`, `v.looseObject`)
is unusual at first. We pay that one-time learning cost for a measurably
smaller install footprint.

**Pattern:** `looseObject` everywhere so forward-compatible additions
(new optional fields in future versions) pass through instead of being
silently dropped. Cross-field invariants (uniqueness of MFE name/port/route)
are checked separately from the schema parse — the schema can't express them
cleanly, and doing it manually gives better error messages.

---

## 5. Convention with smart inference, never enforcement

**Decision:** defaults fill in for things you didn't supply — port, exposes,
remote entry filename, basePath, healing strategy. **User-supplied values
always win.** What was inferred is logged once at dev startup.

**Why:** experimenters want fast scaffolding ("it just works"). Engineers
already operating want predictable explicitness. Inferring without disclosure
hides what makes the app build; refusing to infer makes scaffolding a chore.
Logging in dev only is the middle path: visible during development, silent in
production.

**Where it lives:**
- `deriveMFE()` and `deriveShell()` are pure functions that return both the
  resolved value *and* an `inferred: InferredField[]` list of what was filled
  in (`source: "adapter-default" | "auto-assigned" | "kit-default" |
  "fallback-origin"`).
- `logInferred()` prints one block per scope per process, only when
  `mode === "dev"`.

**Auto port assignment:** when an MFE doesn't supply a port and the framework
adapter doesn't either, kit hashes the MFE name into the range `5173..5273`
and probes for a free slot. Same name → same port, run-over-run. This means
a developer running `pnpm dev` gets stable URLs without authoring them.

---

## 6. Self-healing is runtime, pluggable, forgiving by default

**Decision:** every "what do we do on failure" answer routes through
`HealingStrategy`. Default is forgiving (retry + exponential backoff, then
quarantine, warn on version skew). `strictStrategy()` swaps in fail-fast for
enterprise lockdown.

**Why:** in a microfrontend system you want the *rest of the app* to keep
working when one MFE breaks. A blank page because metrics 404'd is worse than
a degraded shell with metrics quarantined and a banner explaining it.

But: some enterprise contexts require the opposite. A regulated workflow
shouldn't silently mount a stale MFE — it should refuse. So the strategy is
pluggable from day one.

**A throw in kit's runtime is a bug** unless the active strategy chose
`{ action: "fail" }`. The runner is the chokepoint that enforces this.

**Three places to override:** `MFKitConfig.healing` → `<MFKitProvider strategy>`
→ `<MFKitOutlet healing>`. Most specific wins. Same nesting pattern for
`loadRemote`, `quarantineRegistry`, and `entries`.

---

## 7. Plugin-api stays bundler-agnostic

**Decision:** `FrameworkAdapter<BundlerPlugin = unknown>` is generic.
Plugin-api never imports from `vite`, `@module-federation/vite`, React, or
any UI framework. Adapters constrain the generic in the *consumer*
(`@mfkit/kit/vite` uses `vite.Plugin`).

**Why:** "swap the bundler later" is a real option, not a slogan. A future
Rspack adapter is a new subpath, not a fork of kit. Plugin-api never needs
to know.

**Consequence:** `MFKitOutletPropsBase` doesn't know about `ReactNode`.
The framework-specific outlet (in `@mfkit/kit/react`) extends the base.
Future Vue/Svelte outlets would do the same.

---

## 8. The outlet's controller is React-free

**Decision:** the load → mount → unmount engine lives in
`packages/kit/src/react/controller.ts` and imports zero React. The React
component is a thin shell.

**Why:** the controller has imperative state with cancellation, generation
counting, abort signals, and stale-result discarding. That logic is more
testable without a DOM harness, and reusable. A future Vue/Svelte outlet
imports the *same* controller — only the rendering layer changes.

**Generation counting matters.** A user clicks "retry" while a previous load
is mid-flight. The controller increments `generation`; the in-flight promise's
result is discarded if it resolves after the bump. No double-mount, no
out-of-order errors.

---

## 9. `loadRemote` is injected, not imported

**Decision:** `<MFKitOutlet>` doesn't import a Module Federation runtime.
You hand it `loadRemote` (typically from
`@module-federation/enhanced/runtime`) via the provider or the outlet prop.

**Why:** MF has more than one runtime, and they're moving. Locking kit to one
of them creates a forced migration when the ecosystem shifts. Injection
keeps kit usable with any current or future MF runtime.

**Bonus:** tests get a free seam. Pass `loadRemote = vi.fn(() => Promise.resolve(...))`
and the whole outlet is testable without a network or a federation host.

---

## 10. Codemods are single-step, gap-free, ambiguity-free

**Decision:** every codemod migrates exactly `v_n` → `v_n+1`. Multi-step
jumps compose by chaining. The planner refuses to plan a path with a gap or
with two codemods covering the same step.

**Why:** big migrations break in unobvious ways. Small migrations break
visibly. By forcing single-step manifests, every codemod stays small,
audited individually, testable in isolation. Composition is the planner's
job, not the codemod author's.

**The gap rule:** if there's no codemod for v2 → v3, the planner throws.
We do not pretend the missing step is a no-op. Silent gaps lose data.

**The ambiguity rule:** if two codemods both cover v1 → v2, the planner
throws. We do not pick a winner. The author registering the second one
must collapse them, fork the registry, or rename.

---

## 11. Codemod registry returns shape, not file I/O

**Decision:** `generateTurboConfig` returns the JSON shape; the consumer
writes the file. `generateRemoteTypes` returns the string; `writeRemoteTypes`
is the side-effecting wrapper. `watchRemoteTypes` accepts a `reload()`
callback rather than parsing `mfkit.config.ts` itself.

**Why:** keep pure derivers pure. Anything that does file I/O is hard to
test, hard to reuse, and hard to wire into whatever orchestration a
consumer prefers (postinstall hook vs. npm script vs. future `mfkit sync`
CLI). Separating "compute the shape" from "persist the shape" gives
consumers all three.

**`watchRemoteTypes` not parsing the config matters most.** It means kit
works with the manifest authored as TS, JS, JSON, generated — anything
that can yield an `MFKitConfig` object via a `reload()` function.

---

## 12. Forward-compatible manifests via `looseObject`

**Decision:** the Valibot schema uses `looseObject` everywhere. Unknown
keys pass validation; future MFKit versions can add optional fields without
breaking older configs.

**Why:** the alternative — strict objects — turns every additive field into
a breaking change for everyone using a slightly older `@mfkit/kit`. That
churn doesn't buy us anything: TS already gives consumers the strict shape
at author time.

Combined with the schema-version constant and codemod registry, this gives
us a forward-compatible *and* migration-capable manifest format.

---

## 13. Independent semver per `@mfkit/*` package via Changesets

**Decision:** every package versions independently. Changesets is the
release tool.

**Why:** templates move faster than the kit; the kit moves faster than the
plugin-api contract. Forcing all three to bump in lockstep means either the
contract churns unnecessarily or templates lag.

**Pin discipline:** consumer repos should pin `@mfkit/plugin-api` and
`@mfkit/kit` to exact versions during alpha. Caret ranges across major
versions are how downstream apps silently break.

---

## 14. Discriminated unions, not flag objects

**Decision:** `HealingDecision` is a discriminated union on `action`
(`"retry" | "quarantine" | "fail"`). `OutletState` is a discriminated union
on `kind`. Future result-style types follow the same shape.

**Why:** the discriminant is what makes `switch (state.kind)` exhaustive in
TypeScript. A flat object with optional fields can't fail at compile time
when a new state lands; a union can.

This is the kind of guarantee where the cost (slightly more typing at the
call site) buys real downstream safety.

---

## 15. Errors aggregate, not first-fail

**Decision:** `defineConfig` collects every validation issue into one
`MFKitConfigError` with `issues: { path, message }[]` instead of throwing on
the first problem.

**Why:** fix-one-discover-the-next is a slow, bad loop. Seeing all problems
at once means fewer round-trips. The cost (more validator work on already-
broken input) is irrelevant since input is broken anyway.

Same pattern in `generateTurboConfig`, `generateRemoteTypes`, the codemod
registry. Once a project picks an error shape, every new validator should
match it.

---

## What we *don't* commit to

A few things that look like decisions but are deliberately left open:

- **No opinion on routing.** The shell picks its own router. `<MFKitOutlet>`
  is route-agnostic; it just owns one mount.
- **No opinion on state management.** Cross-MFE shared state is
  application-level. Kit doesn't ship an EventBus, a store, or a context.
- **No opinion on testing libraries.** Per-package: kit uses Vitest,
  consumers pick their own.
- **No opinion on CSS/styling.** That's framework-adapter and consumer
  territory.

Saying no to these now is what keeps the surface small enough to be safe
to lock in v0.1.
