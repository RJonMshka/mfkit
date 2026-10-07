# Contributing to MFKit

Thanks for helping. MFKit is alpha, so the most valuable contributions right now
are **bug reports with reproductions**, **fixes with regression tests**, and
**docs that close the gap between what the README says and what the code does**.

## Ground rules

- **Discuss before building anything large.** Open a Discussion or an issue
  first for new features, new subpaths, or anything touching
  `@mfkit/plugin-api`. MFKit adds abstractions when a real consumer needs them
  (see `docs/ideas.md`), not ahead of that.
- **Every bug fix ships with a test that fails without it.**
- **Be kind.** This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requires Node ≥ 22 (`.nvmrc`) and pnpm ≥ 10 (`corepack enable` picks the pinned version).

```bash
pnpm install
pnpm build        # turbo: builds every package in dependency order
pnpm typecheck
pnpm test         # vitest, per package
pnpm lint         # biome (lint + format check); `pnpm biome check --write .` to fix
```

The example app is the end-to-end gate:

```bash
pnpm --filter mfkit-example-minimal smoke   # builds + previews, HTTP checks
pnpm --filter mfkit-example-minimal e2e     # headless system Chrome, asserts mount + styles
```

`e2e` uses your installed Google Chrome via `playwright-core` (no browser download).

## Repo map

| Path | What lives there |
|---|---|
| `packages/plugin-api` | The public contract. **Types only.** Sole runtime export: `MFKIT_CONFIG_VERSION`. |
| `packages/kit` | Runtime + generators. One subpath per concern: `/vite`, `/react`, `/healing`, `/turbo`, `/types`. |
| `packages/codemods` | Version-manifest format, migration registry, `mfkit-migrate` CLI. |
| `examples/minimal` | React shell + React MFE + Svelte MFE. Runs in CI. |
| `docs/` | Architecture, design decisions (ADRs), integration guide, plan, findings. |

Read `docs/architecture.md` for the 30-second mental model and
`docs/design-decisions.md` before proposing a change to how things work.

## The invariants (PRs that break these will be asked to change)

1. `@mfkit/plugin-api` has no runtime code beyond `MFKIT_CONFIG_VERSION`.
   Breaking its surface bumps the config version and needs a codemod plan.
2. `@mfkit/kit` peers (`vite`, `react`, every framework plugin, the MF plugin)
   stay **optional**. A Svelte-only consumer must never install React.
   `tests/vite/subpath-isolation.test.ts` enforces this.
3. The manifest (`mfkit.config.ts`) is the single source of truth. Generated
   artifacts are derived from it, never a second source.
4. Inference fills gaps; user-supplied values always win; inferred values are
   logged once in dev.
5. Runtime failures route through a `HealingStrategy`. Throwing from kit
   runtime is a bug unless the strategy chose `{ action: "fail" }`.

## Code style

- TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`. ESM only.
- Biome formats and lints; CI fails on errors. Don't hand-format.
- Prefer pure functions with injected I/O (see `vite/derive.ts`,
  `react/controller.ts`) so logic tests without a bundler or DOM.
- Comments explain *why* — especially the failure a line prevents. Reference
  the finding or ADR it came from.
- Errors users can hit are `MFKitConfigError` with a `path` and an actionable
  message that says what to do next.

## Tests

- Unit tests live in `packages/*/tests/**` (vitest). Mirror the `src/` layout.
- Testing plan, layers, and what each layer is responsible for:
  [`docs/testing-and-evaluation.md`](docs/testing-and-evaluation.md).
- If your change is visible in a browser, extend `examples/minimal/scripts/e2e.mjs`.

## Changesets and releases

Any change a consumer could notice (behavior, API, types, published files)
needs a changeset:

```bash
pnpm changeset
```

Pick the affected `@mfkit/*` packages and a bump level. Docs/CI/test-only PRs
don't need one. Packages are versioned independently. The repo is in changesets
**pre-release mode (`alpha`)**; merging to `main` opens a "version packages" PR,
and merging that publishes to npm.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) with a package
scope: `fix(kit): …`, `feat(codemods): …`, `docs: …`, `chore: …`.

## Pull requests

Fill in the PR template. Keep PRs focused: one fix or feature each. A
maintainer reviews within a few days; if you've heard nothing in a week, ping
the PR.
