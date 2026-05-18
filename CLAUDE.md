# MFKit

Framework for polyglot Module Federation — scaffolder + runtime + plugin system. Extracted from DevNexus (a separate repo, the canonical example app). Currently mid-Phase 1.

**Read `docs/mfekit-plan.md` before any non-trivial change.** It is the source of truth for what each phase ships, what the exit criteria are, and what is explicitly deferred.

## Repo layout

```
packages/
  plugin-api/   @mfkit/plugin-api   types-only contract (zero runtime except MFKIT_CONFIG_VERSION)
  kit/          @mfkit/kit          runtime — defineConfig/defineMFE done; vite, react, healing are stubs
  codemods/     @mfkit/codemods     CLI + migration registry skeleton; Phase 1 ships zero codemods
examples/       empty (Phase 2)
```

## Phase 1 status (what's actually built vs. planned)

- Step 1 — plugin-api surface: **done**. 7 domain files, locked, type-tested.
- Step 2 — `defineConfig`/`defineMFE` with valibot validation: **done**.
- Steps 4 (Vite config gen), 6 (`<MFKitOutlet>`), 7 (healing primitives), 8 (federated remote types), 9 (Turbo gen): **stubs only** — `packages/kit/src/{vite,react,healing}.ts` are placeholder `export {}` files awaiting implementation.
- Step 10 — codemods scaffold: present (`packages/codemods/src/{cli,index}.ts`); no migrations registered.
- DevNexus integration (Steps 3, 5): blocked on DevNexus repo, not this one.

## Load-bearing invariants

1. **`@mfkit/plugin-api` is types-only.** The single runtime export is the `MFKIT_CONFIG_VERSION = 1` constant. No schemas, no helpers, no functions with bodies. Validation lives in kit. Breaking changes to this surface bump the version and require a codemod registration.
2. **`@mfkit/kit` peer dependencies are optional.** `vite`, `@module-federation/vite`, `react`, `react-dom` are all optional peers. Subpath entries (`/vite`, `/react`, `/healing`) must be tree-shakable in isolation — a Svelte-only consumer must not have to install React.
3. **Manifest is the single source of truth.** `mfkit.config.ts` → Vite configs, Turbo pipelines, route maps, remote `.d.ts`. Hand-edits to generated artifacts are escape hatches; if a feature needs a second source of truth, redesign it.
4. **Convention with smart inference, never enforcement.** Defaults fill in; user-supplied values always win; what was inferred is logged at dev startup.
5. **Self-healing is runtime, pluggable, forgiving by default.** Every "what happens on failure" answer routes through `HealingStrategy`. Throwing from kit runtime is a bug unless the active strategy chose `{ action: "fail" }`.

## Validation library

Valibot, not Zod. Smaller, tree-shakable, matches our `sideEffects: false` story across packages. See `packages/kit/src/index.ts` for the established pattern (`looseObject` so forward-compatible additions pass; aggregated `MFKitConfigError` issues with `path` + `message`; cross-field invariants checked separately from schema parse).

## Framework adapter facts (do not "correct" against older notes)

- Angular uses `@analogjs/vite-plugin-angular`. The "native-federation" wording from older memory/docs is outdated.
- All current MFEs expose `"./lifecycle"` (plain). The `"././"` workaround from older memory is obsolete.

## Commands

```bash
pnpm install
pnpm -r build       # turbo, dependsOn ^build, outputs dist/**
pnpm -r typecheck
pnpm -r test        # vitest, --passWithNoTests in stubs
pnpm changeset      # version bumps; independent semver per @mfkit/* package
```

Per-package work: `pnpm --filter @mfkit/<pkg> <script>`.

## TypeScript

Strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. ESM only (`"type": "module"`). Tsup builds; tsconfig extends `tsconfig.base.json` at root.

## Agents

- `plugin-api-steward` — use for any edit to `packages/plugin-api/**`. Enforces types-only, readonly-everywhere, no bundler/UI imports, breaking-change protocol.
- `mfkit-runtime-engineer` — use for `packages/kit/**` implementation work (Steps 4, 6, 7, 8, 9). Knows the subpath map, peer-dep model, framework-adapter rules, DevNexus migration order.

## Things this repo intentionally does **not** ship in Phase 1

CLI scaffolder (Phase 2), external template registry (Phase 2), real codemods (Phase 3), enterprise lockdown/governance (Phase 4+), `.claude/` skill bundle generalized for consumers (Phase 5). Don't pull these forward.
