---
"@mfkit/kit": minor
"@mfkit/plugin-api": patch
---

Beta: the plugin system is real, healing recovers on its own, and strict-CSP
hosts work.

- `@mfkit/kit`: new `resolveConfig(config, { cwd })`. Validates, applies plugin
  adapters/healing, runs discovery strategies (discovered MFEs are added and
  never replace a declared name), re-validates, then runs each plugin's
  `setup` once. `mfkitMFE`/`mfkitShell` use it, so discovered MFEs reach the
  shell's remotes (new `root` option for the discovery cwd).
- `@mfkit/kit/react`: `<MFKitProvider config={config}>` takes entries and the
  config's healing strategy (`config.healing` > last plugin > forgiving).
  `resolveHealingStrategy` honors plugins too.
- `@mfkit/kit/healing`: `createQuarantineRegistry({ cooldownMs })` turns
  quarantine into a circuit breaker. After the cooldown the outlet makes a
  single probe on its own; a failed probe re-quarantines immediately. The
  default is unchanged (permanent until cleared).
- `@mfkit/kit/vite`: **behavior change**: `mfkitShell` now sets
  `shareStrategy: "loaded-first"`. The MF default (`"version-first"`) fetched
  every remote at startup, so one slow remote delayed the whole shell.
  Restore with `{ shareStrategy: "version-first" }`.
- `@mfkit/kit/vite`: injected remote styles copy the page's CSP nonce from
  `<meta property="csp-nonce">`, so remotes stay styled under
  `style-src 'nonce-…'`.
- `@mfkit/kit/vite`: auto-assigned ports no longer depend on manifest order
  (reordering could swap two MFEs' ports). If two of your port-less MFEs
  collided, their ports may change once; set `port` explicitly to pin them.
- `@mfkit/plugin-api`: JSDoc for the now-wired surfaces; discovery precedence
  documented as manifest-wins. No type changes.
