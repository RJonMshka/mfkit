---
"@mfkit/kit": patch
---

Two fixes surfaced by the new `examples/minimal` consumer:

- `mfkitShell` now declares remotes in object form with `type: "module"`.
  Vite-built remote entries are ESM; the MF runtime treated the previous
  plain-URL strings as script-injection ("var") remotes, which failed with
  `Cannot use import statement outside a module` and prevented the shell
  from booting.
- `generateTurboConfig` orchestrates `<shell>#dev` via `with` instead of
  `dependsOn`. Turbo 2.x rejects depending on persistent tasks, so the
  previous output was unusable for `turbo run dev`.
