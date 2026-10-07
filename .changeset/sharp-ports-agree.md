---
"@mfkit/kit": minor
"@mfkit/codemods": minor
"@mfkit/plugin-api": minor
---

Correctness fixes from the October 2026 project review:

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
