# MFKit

Framework for polyglot Module Federation — scaffolder + runtime + plugin system. Extracted from DevNexus (a separate repo, the canonical example app). Currently mid-Phase 1.

**Read `docs/mfekit-plan.md` before any non-trivial change.** It is the source of truth for what each phase ships, exit criteria, and what is explicitly deferred.

## Repo layout

```
packages/
  plugin-api/   @mfkit/plugin-api   types-only contract (sole runtime export: MFKIT_CONFIG_VERSION)
  kit/          @mfkit/kit          runtime — defineConfig/defineMFE, vite/, healing/, react (stub)
  codemods/     @mfkit/codemods     CLI + migration registry skeleton; zero migrations registered
examples/       empty (Phase 2)
```

## Phase 1 status

- Steps 1, 2 — plugin-api surface + `defineConfig`/`defineMFE` with valibot: **done**
- Step 4 — Vite config generation (`@mfkit/kit/vite`, framework adapters): **done**
- Step 7 — Self-healing primitives (`@mfkit/kit/healing`): **done** — strategies, runner, quarantine registry, version check, manifest cache
- Step 6 — `<MFKitOutlet>` in `@mfkit/kit/react`: **stub** (`export {}`)
- Steps 8 (federated remote types) and 9 (Turbo gen): not started
- Step 10 — codemods scaffold: skeleton present, no migrations
- Steps 3, 5 — DevNexus integration: blocked on DevNexus repo

## Load-bearing invariants

1. **`@mfkit/plugin-api` is types-only.** Sole runtime export is `MFKIT_CONFIG_VERSION = 1`. No schemas, no helper functions with bodies. Validation lives in kit. Breaking the surface bumps the version and requires a codemod registration.
2. **`@mfkit/kit` peer dependencies are optional.** `vite`, `@module-federation/vite`, `react`, `react-dom`, and every framework Vite plugin are optional peers. Subpath entries (`/vite`, `/react`, `/healing`) must be tree-shakable in isolation — a Svelte-only consumer must not have to install React. Enforced by `tests/vite/subpath-isolation.test.ts`.
3. **Manifest is the single source of truth.** `mfkit.config.ts` → Vite configs, Turbo pipelines, route maps, remote `.d.ts`. Hand-edits to generated artifacts are escape hatches; a feature needing a second source of truth gets redesigned.
4. **Convention with smart inference, never enforcement.** Defaults fill in; user-supplied values always win; what was inferred is logged once at dev startup (see `src/vite/inference-log.ts`).
5. **Self-healing is runtime, pluggable, forgiving by default.** Every "what happens on failure" routes through `HealingStrategy`. Throwing from kit runtime is a bug unless the active strategy chose `{ action: "fail" }`.

## Validation library

Valibot, not Zod. Smaller, tree-shakable, matches our `sideEffects: false` story. Pattern in `packages/kit/src/index.ts`: `looseObject` so forward-compatible additions pass; aggregated `MFKitConfigError` issues with `path` + `message`; cross-field invariants (uniqueness etc.) checked separately from schema parse.

## Framework adapter facts (do not "correct" against older notes)

- Angular uses `@analogjs/vite-plugin-angular`. The "native-federation" wording from older memory is outdated.
- All current MFEs expose `"./lifecycle"` (plain). The `"././"` workaround from older memory is obsolete.

## TypeScript

Strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. ESM only (`"type": "module"`). Tsup builds; tsconfig extends `tsconfig.base.json` at root.

## Commands

`pnpm -r build | typecheck | test` at root; `pnpm --filter @mfkit/<pkg> <script>` per-package. Versioning via `pnpm changeset` (independent semver per `@mfkit/*` package).

## Agents

- `plugin-api-steward` — any edit to `packages/plugin-api/**`. Enforces types-only, readonly-everywhere, no bundler/UI imports, breaking-change protocol.
- `mfkit-runtime-engineer` — implementation work in `packages/kit/**`. Knows the subpath map, peer-dep model, framework-adapter rules, DevNexus migration order.
