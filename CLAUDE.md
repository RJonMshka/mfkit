# MFKit

Framework for polyglot Module Federation — scaffolder + runtime + plugin system. Extracted from DevNexus (a separate repo, the canonical example app). Currently mid-Phase 1.

**Read `docs/mfekit-plan.md` before any non-trivial change.** It is the source of truth for what each phase ships, exit criteria, and what is explicitly deferred.

## Repo layout

```
packages/
  plugin-api/   @mfkit/plugin-api   types-only contract (sole runtime export: MFKIT_CONFIG_VERSION)
  kit/          @mfkit/kit          runtime — defineConfig/defineMFE, vite/, healing/, react/, turbo/, types/
  codemods/     @mfkit/codemods     version-manifest format + in-memory registry + mfkit-migrate CLI; zero codemods registered (v0.3+)
examples/
  minimal/      react shell + react MFE + svelte MFE, one mfkit.config.ts; the "second consumer" —
                runs in CI (HTTP smoke + headless-Chrome e2e via scripts/{smoke,e2e}.mjs)
```

## Phase 1 status

- Steps 1, 2 — plugin-api surface + `defineConfig`/`defineMFE` with valibot: **done**
- Step 4 — Vite config generation (`@mfkit/kit/vite`, framework adapters): **done**
- Step 7 — Self-healing primitives (`@mfkit/kit/healing`): **done** — strategies, runner, quarantine registry, version check, manifest cache
- Step 6 — `<MFKitOutlet>` in `@mfkit/kit/react`: **done** — outlet + `MFKitProvider` + slot props; load/mount routed through `runWithHealing`; `loadRemote` injected (no MF runtime dep); pure controller covered by `tests/react/controller.test.ts`
- Step 9 — Turbo pipeline generation (`@mfkit/kit/turbo`): **done** — `generateTurboConfig(manifest, opts?)` returns the JSON shape; reads `<path>/package.json` for each shell + MFE to learn npm names (manifest carries `path`, not `name`); emits base task block + `<shell-pkg>#dev` that starts every `<mfe-pkg>#dev` via `with` (not `dependsOn` — Turbo 2.x rejects depending on persistent tasks); pure, no file I/O — consumers serialize/write
- Step 8 — federated remote type generation (`@mfkit/kit/types`): **done** — `generateRemoteTypes(manifest, opts?)` is a pure manifest→string deriver emitting `declare module "<name>/<expose>"` blocks typed as `MFEDefinition`; `writeRemoteTypes` persists with an unchanged-skip guard; `watchRemoteTypes` is a thin fs.watch wrapper that takes a consumer `reload()` so kit never parses `mfkit.config.ts` itself. Default out path `.mfkit/generated/remotes.d.ts`. Subpath is pure node — enforced by `tests/vite/subpath-isolation.test.ts`
- Step 10 — codemods scaffold (`@mfkit/codemods`): **done** — `CodemodManifest` with the single-step `toVersion === fromVersion + 1` invariant, in-memory `registerCodemod` / `listCodemods` / `planMigration` registry that refuses gaps and ambiguity, and a `mfkit-migrate` CLI with `list` / `plan` / `up [--dry-run]` subcommands wired end-to-end. Zero codemods registered — first real migration lands v0.3+. Tests in `packages/codemods/tests/{registry,cli}.test.ts`
- Steps 3, 5 — DevNexus integration: **done** — DevNexus runs through the kit
- `examples/minimal` — second consumer, in CI. Findings it produced live in `docs/dx-findings.md`; all 7 are now fixed. Its e2e asserts computed styles (not just mount state) — the CSS-reaching-the-shell bug was invisible to every other assertion

## Load-bearing invariants

1. **`@mfkit/plugin-api` is types-only.** Sole runtime export is `MFKIT_CONFIG_VERSION = 1`. No schemas, no helper functions with bodies. Validation lives in kit. Breaking the surface bumps the version and requires a codemod registration.
2. **`@mfkit/kit` peer dependencies are optional.** `vite`, `@module-federation/vite`, `react`, `react-dom`, and every framework Vite plugin are optional peers. Subpath entries (`/vite`, `/react`, `/healing`, `/turbo`, `/types`) must be tree-shakable in isolation — a Svelte-only consumer must not have to install React; `/turbo` and `/types` are pure node (no bundler/UI imports). Enforced by `tests/vite/subpath-isolation.test.ts`.
3. **Manifest is the single source of truth.** `mfkit.config.ts` → Vite configs, Turbo pipelines, route maps, remote `.d.ts`. Hand-edits to generated artifacts are escape hatches; a feature needing a second source of truth gets redesigned.
4. **Convention with smart inference, never enforcement.** Defaults fill in; user-supplied values always win; what was inferred is logged once at dev startup (see `src/vite/inference-log.ts`).
5. **Self-healing is runtime, pluggable, forgiving by default.** Every "what happens on failure" routes through `HealingStrategy`. Throwing from kit runtime is a bug unless the active strategy chose `{ action: "fail" }`.

## Validation library

Valibot, not Zod. Smaller, tree-shakable, matches our `sideEffects: false` story. Pattern in `packages/kit/src/index.ts`: `looseObject` so forward-compatible additions pass; aggregated `MFKitConfigError` issues with `path` + `message`; cross-field invariants (uniqueness etc.) checked separately from schema parse.

## Framework adapter facts (do not "correct" against older notes)

- Angular uses `@analogjs/vite-plugin-angular`. The "native-federation" wording from older memory is outdated.
- All current MFEs expose `"./lifecycle"` (plain). The `"././"` workaround from older memory is obsolete.
- Shell remotes must be emitted in object form with `type: "module"` — vite-built remote entries are ESM; string remotes silently fall back to broken script-injection loading (RUNTIME-001).
- MFE builds inline their CSS into the remote entry (`src/vite/css-inject.ts` → `cssInjectedByJs`, on by default, `injectCss: false` to opt out). A built remote's CSS asset is only referenced by its own `index.html`, which a federated host never loads — without this every MFE renders unstyled in the shell while looking fine standalone.
- Generated federation configs pass `dts: false`. Kit owns remote types via `@mfkit/kit/types`; the MF plugin's dts machinery only adds a failed-to-prebundle warning on every dev boot.
- `exposes` is inferred by probing `./src/lifecycle.{ts,tsx,mts,js,jsx,mjs}` — a React lifecycle is `.tsx`, a Svelte one `.ts`, and hardcoding either fails inside the MF plugin with no hint that kit invented the path. The probe checks both `cwd` and `cwd + entry.path`: vite runs per-app, tooling runs from the workspace root, and manifest paths are root-relative in both cases.

## TypeScript

Strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. ESM only (`"type": "module"`). Tsup builds; tsconfig extends `tsconfig.base.json` at root.

## Commands

`pnpm -r build | typecheck | test` at root; `pnpm --filter @mfkit/<pkg> <script>` per-package. Versioning via `pnpm changeset` (independent semver per `@mfkit/*` package).

## Agents

- `plugin-api-steward` — any edit to `packages/plugin-api/**`. Enforces types-only, readonly-everywhere, no bundler/UI imports, breaking-change protocol.
- `mfkit-runtime-engineer` — implementation work in `packages/kit/**`. Knows the subpath map, peer-dep model, framework-adapter rules, DevNexus migration order.
