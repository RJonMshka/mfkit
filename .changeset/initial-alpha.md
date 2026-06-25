---
"@mfkit/plugin-api": minor
"@mfkit/kit": minor
"@mfkit/codemods": minor
---

Initial alpha release of MFKit — Phase 1 framework surface.

- `@mfkit/plugin-api`: stable types-only contract (`MFKIT_CONFIG_VERSION = 1`).
- `@mfkit/kit`: `defineConfig`/`defineMFE`, Vite config generation (`./vite`), `<MFKitOutlet>` (`./react`), self-healing primitives (`./healing`), Turbo pipeline generation (`./turbo`), federated remote type generation (`./types`).
- `@mfkit/codemods`: version-manifest registry + `mfkit-migrate` CLI (zero codemods registered; first migration lands v0.3+).
