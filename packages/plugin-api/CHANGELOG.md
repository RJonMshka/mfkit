# @mfkit/plugin-api

## 0.1.0-alpha.1

### Minor Changes

- 0131a4a: Correctness fixes from the October 2026 project review:

  - `@mfkit/kit`: an MFE's dev/preview port is now resolved from the manifest
    alone, exactly as the shell computes it. Previously `FrameworkAdapter.defaultPort`
    won on the MFE side but was invisible to the shell, so the MFE served on one
    port while the shell fetched from another — and two MFEs on the same adapter
    both claimed the default port.
  - `@mfkit/kit`: `defineConfig` now rejects an MFE whose `port` equals the
    shell's port (explicit, or the default 3000).
  - `@mfkit/kit/react`: `<MFKitOutlet props={{ ... }} />` with an inline object no
    longer unmounts and remounts the MFE on every parent re-render; props are
    compared shallowly.
  - `@mfkit/kit/vite`: framework adapters contributed through
    `config.plugins[].frameworkAdapters` are now honored (later plugins override
    earlier ones; `opts.adapters` overrides both). They were documented and
    recommended by the unknown-framework error, but never read.
  - `@mfkit/kit/vite`: the CSS-injection snippet is appended to entry chunks
    instead of prepended, so enabling `build.sourcemap` no longer yields maps
    shifted by one line.
  - `@mfkit/codemods`: the `mfkit-migrate` binary did nothing (exit 0, no output)
    when launched through npm/pnpm's `node_modules/.bin` link. Entrypoint
    detection now compares real paths.
  - All packages: **Node.js ≥ 22 is now required** (`engines.node`). Node 20
    reached end-of-life in April 2026.
  - `@mfkit/plugin-api`: `FrameworkAdapter.defaultPort` is marked `@deprecated`
    (JSDoc only; no type change).

### Patch Changes

- 6743676: Self-healing that actually heals, proven by a new fault-injection e2e:

  - `@mfkit/kit/healing`: new `createFederationLoader(runtime)`. The Module
    Federation runtime caches failed remote-entry loads (and the browser caches
    failed module imports), so the outlet's retries replayed the first failure
    without touching the network. The loader re-registers a failed remote under
    a cache-busted URL so each retry really refetches. Use it as the provider's
    `loadRemote`:
    `createFederationLoader(await import("@module-federation/runtime"))`.
  - Docs + example: shells must load remotes through the MF runtime, not
    `import("mfe_x/lifecycle")`. `@module-federation/vite` preloads every
    specifier-imported remote before the app starts, so a single outage left the
    whole shell blank.
  - `@mfkit/kit/vite`: built-in React/Vue/Angular adapters no longer pin
    `requiredVersion` (`^18`/`^3`/`^17`). The MF plugin derived the _advertised_
    version from it, so React 19 apps claimed to provide react@18.0.0.
  - `@mfkit/kit/vite`: the missing-peer hint names the package that is actually
    missing (e.g. `@angular/compiler-cli`, required by the analog plugin).
  - `@mfkit/kit/react`: a mount waits for any pending async `unmount` on the same
    container, including one from a previous outlet instance.
  - `@mfkit/kit/healing`: `MFEQuarantinedError` exposes `reason`; quarantine
    slots no longer truncate multi-line reasons.
  - `@mfkit/plugin-api`: unwired fields (`discovery`, plugin `healing`/`setup`,
    `budgets`/`budgetBytes`, automatic `onVersionMismatch`) are marked
    `@experimental` in JSDoc. No type changes.

## 0.1.0-alpha.0

### Minor Changes

- f721015: Initial alpha release of MFKit — Phase 1 framework surface.

  - `@mfkit/plugin-api`: stable types-only contract (`MFKIT_CONFIG_VERSION = 1`).
  - `@mfkit/kit`: `defineConfig`/`defineMFE`, Vite config generation (`./vite`), `<MFKitOutlet>` (`./react`), self-healing primitives (`./healing`), Turbo pipeline generation (`./turbo`), federated remote type generation (`./types`).
  - `@mfkit/codemods`: version-manifest registry + `mfkit-migrate` CLI (zero codemods registered; first migration lands v0.3+).
