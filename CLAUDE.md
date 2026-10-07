# MFKit

Framework for polyglot Module Federation: one manifest → Vite/MF configs, shell remote map, remote `.d.ts`, Turbo pipeline; plus a healing runtime outlet. Extracted from DevNexus (separate repo, the original consumer). **Phase 1 complete; alpha (`0.1.0-alpha.x`), changesets pre-release mode.** Open-source; written for outside contributors (see `CONTRIBUTING.md`).

## Read first

| Doc | Use it for |
|---|---|
| `docs/mfekit-plan.md` | Source of truth for phases, exit criteria, explicit deferrals. Read before any non-trivial change. |
| `docs/project-review-2026-10.md` | Current known issues (O1–O9), architecture direction (A1–A6), sequencing. Check here before "discovering" a gap. |
| `docs/testing-and-evaluation.md` | Test layers L1–L8 and what each must catch; where a new test belongs. |
| `docs/design-decisions.md` | ADRs. Don't relitigate without a new ADR. |
| `docs/dx-findings.md` | Consumer-found bugs + their regression guards. Append new consumer findings here. |
| `docs/ideas.md` | Parked ideas with unpark conditions. Don't start these quietly. |

## Repo layout

```
packages/
  plugin-api/  @mfkit/plugin-api  types-only contract (sole runtime export: MFKIT_CONFIG_VERSION)
  kit/         @mfkit/kit         index (defineConfig/defineMFE) + subpaths /vite /react /healing /turbo /types
  codemods/    @mfkit/codemods    version-manifest registry + mfkit-migrate CLI; zero codemods (v0.3+)
examples/minimal/                 React shell + React MFE + Svelte MFE; CI runs smoke + headless-Chrome e2e
```

## Load-bearing invariants

1. **`@mfkit/plugin-api` is types-only.** No schemas, no function bodies. Breaking the surface bumps `MFKIT_CONFIG_VERSION` and needs a codemod. Additive optional fields are fine. Deprecate via JSDoc `@deprecated`, never by deleting.
2. **`@mfkit/kit` peers are optional** (`vite`, `@module-federation/vite`, `react`, `react-dom`, every framework plugin). Subpaths tree-shake in isolation; `/turbo` and `/types` are pure node. Enforced by `tests/vite/subpath-isolation.test.ts`.
3. **Manifest is the single source of truth.** A feature needing a second source gets redesigned. CI fails if `examples/minimal/.mfkit/generated/` drifts from the manifest.
4. **Inference, never enforcement.** Defaults fill gaps; user values win; inferences logged once in dev (`src/vite/inference-log.ts`).
5. **Healing is runtime and pluggable.** Every failure routes through `HealingStrategy`. Throwing from kit runtime is a bug unless the strategy chose `{ action: "fail" }`.

## Facts that are easy to get wrong

- **`resolveConfig` (src/resolve.ts) is the pipeline**: validate → plugin surfaces → discovery (manifest entries never replaced) → re-validate → plugin `setup` once. Memoized per config object. `mfkitMFE`/`mfkitShell` call it; sync generators accept its result. Runtime healing: `<MFKitProvider config>` / `resolveHealingStrategy` (config > last plugin > forgiving).
- **`mfkitShell` defaults `shareStrategy: "loaded-first"`.** MF's `"version-first"` initializes every remote at boot, so one slow remote delays the whole shell (review R10).
- **Ports have exactly one resolver**, used by both the MFE side and the shell side: `entry.port ?? autoAssignPorts(config)` (hash into 5173–5273 in *name* order, skipping explicit ports and the shell's effective port; order-independence is a property test, review R11). `FrameworkAdapter.defaultPort` is deprecated and ignored. The shell never loads MFE adapters, so anything adapter-derived can't reach the remote URL. `defineConfig` rejects MFE↔shell port clashes (shell default `DEFAULT_SHELL_PORT = 3000`).
- **Adapter precedence:** `opts.adapters` > `config.plugins[].frameworkAdapters` (later plugin wins) > built-ins (`vite/adapter-resolve.ts`, lazy-imported).
- **Shells load remotes through the MF runtime, never `import("mfe_x/…")`.** `@module-federation/vite` preloads every specifier-imported remote with `Promise.all` before the app starts: one remote down → blank shell (review R7). Use `createFederationLoader(await import("@module-federation/runtime"))` from `/healing` as the provider's `loadRemote`.
- **The MF runtime caches failed remote loads** (rejections included, per name+URL), as does the browser module map. `createFederationLoader` re-registers a failed remote under `?mfkit-retry=N` so retries really refetch (review R8). Any new loader path must preserve this; `faults.mjs` asserts exactly `maxAttempts` fetches.
- **Built-in adapters never pin `requiredVersion`.** The MF plugin derives the *advertised* version from it; let it read the installed package (review O2).
- **Quarantine cooldown** (`createQuarantineRegistry({ cooldownMs })`): half-open = one probe, a failed probe re-quarantines without consulting the strategy; the controller schedules the probe itself. Default is permanent.
- **Injected `<style>` copies the CSP nonce** from `<meta property="csp-nonce">` (Vite's convention).
- **Mounts wait for the container's pending unmount** (`pendingTeardowns` in `react/controller.ts`), across controller instances (review O7).
- **Shell remotes are object-form with `type: "module"`.** String remotes fall back to script injection and break (RUNTIME-001).
- **MFE builds inline CSS into entry chunks** (`vite/css-inject.ts`, on by default, `injectCss: false` opts out). The snippet is *appended* so sourcemaps stay aligned.
- **Generated federation configs pass `dts: false`.** Kit owns remote types via `/types`.
- **`exposes` is probed**: `./src/lifecycle.{ts,tsx,mts,js,jsx,mjs}` under both `cwd` and `cwd + entry.path`. User `exposes` is never probed. The example relies on this (no explicit `exposes`).
- **React outlet stability:** `entries` (provider) is keyed by content (`entries-cache.ts`); `props` (outlet) by shallow equality (`stable-props.ts`). Inline literals must never remount an MFE.
- **The outlet's error boundary can't see errors inside a mounted MFE** (separate roots). Post-mount errors are currently unobserved (review O3).
- **Typed but not wired** (JSDoc `@experimental`): `budgets`/`budgetBytes`, `templateResolvers`, automatic `onVersionMismatch`. Don't document them as working (review O1).
- Angular uses `@analogjs/vite-plugin-angular` (not native-federation). Expose key is plain `"./lifecycle"` (the `"././"` workaround is obsolete).
- `mfkit-migrate` detects "run as binary" by comparing **real paths** (`isEntrypoint`); bins are symlinks/shims.

## Conventions

- **Valibot, not Zod.** `looseObject` for forward-compat; aggregate all issues into one `MFKitConfigError` (`path` + `message`); cross-field checks separate from schema parse (`src/index.ts`).
- **Pure core, injected I/O** (`derive.ts` takes `exists`; controller takes `loadRemote`). Keep new logic testable without a bundler or DOM.
- **Every bug fix ships with a regression test** that fails without it, and a comment naming the failure it prevents (cite the finding/review id).
- **Errors users can hit** say what's wrong, where (manifest path), and what to do next.
- **Consumer-visible change → changeset** (`pnpm changeset`). Docs/CI/test-only → none.
- **Commits:** Conventional Commits with package scope (`fix(kit): …`).
- TypeScript: strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. ESM only. tsup builds.

## Commands

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test     # the PR gate (turbo)
pnpm biome check --write .                                 # auto-fix lint/format
pnpm --filter @mfkit/kit test                               # one package
pnpm --filter mfkit-example-minimal gen                     # regenerate example artifacts
pnpm --filter mfkit-example-minimal smoke                   # build + vite preview + HTTP checks
pnpm --filter mfkit-example-minimal e2e                     # headless system Chrome (playwright-core)
pnpm --filter mfkit-example-minimal faults                  # L6: remote outages → quarantine, retry, recovery
pnpm test:coverage                                          # unit + DOM tests with v8 coverage
pnpm pack-check                                             # L4: install tarballs into a fresh Svelte-only app (network)
pnpm --filter mfkit-example-minimal e2e:dev                 # L5: same e2e against Vite dev servers
pnpm build && pnpm api:check                                # L2: public .d.ts must match packages/*/api-report.d.ts
pnpm api:update                                             #     after an intentional API change (+ changeset)
```

Run smoke + e2e + faults for anything touching `/vite`, `/react`, `/healing`, CSS injection, or the example. React glue changes need `tests/react/outlet.dom.test.tsx` (happy-dom) coverage, not just controller tests. The example runs React 19 with React/Svelte/Vue/Lit MFEs; kit's DOM tests run React 18 (the peer floor). Kit coverage is gated (healing/derive ≥ 95% branches): never lower a threshold to pass. Unit tests can't see bundler/runtime behavior. CI also runs publint + are-the-types-wrong on every package.

## Agents

- `plugin-api-steward`: any edit to `packages/plugin-api/**`. Enforces types-only, readonly, no bundler/UI imports, breaking-change protocol.
- `mfkit-runtime-engineer`: implementation in `packages/kit/**`. Knows the subpath map, peer-dep model, adapter rules.
- `mfkit-debugger`: failing tests/builds/mounts; runs the right scoped commands first.
