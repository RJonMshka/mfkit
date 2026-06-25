# MFKit

> Polyglot Module Federation, scaffolded and self-healing.

MFKit is a framework for building production-grade microfrontend architectures
where every MFE can be in a different framework (React, Svelte, Vue, Angular,
Lit) and the system stays smart, self-healing, and adaptable.

**Status:** alpha (Phase 1). API surface is unstable until v0.1.

## What's in the box

| Package | Purpose |
|---|---|
| `@mfkit/plugin-api` | Stable TypeScript types — the contract every layer implements. |
| `@mfkit/kit` | Runtime + Vite config generation + self-healing primitives + `<MFKitOutlet>`. |
| `@mfkit/codemods` | Upgrade tooling (infra now; codemods land v0.3+). |
| `create-mfkit` | CLI scaffolder (Phase 2). |
| `@mfkit/template-*` | Per-framework MFE templates (Phase 2). |

## Why MFKit

1. **Convention with smart inference, not enforcement.** Detect, propose, apply.
2. **Every layer pluggable.** Lock the plugin API; iterate freely behind it.
3. **Self-healing at runtime.** Boundaries, retries, quarantine, last-known-good cache.
4. **Templates are first-class.** Reusable, versioned, npm + git + local-path.
5. **AI tooling is tier-1.** Skills, agents, MCPs ship with the scaffold.

## Local development

Requires Node ≥ 20, pnpm ≥ 10.

```bash
pnpm install
pnpm -r build      # build all packages
pnpm -r typecheck
pnpm -r test
```

## Reference implementation

The [DevNexus](https://github.com/RJonMshka/DevNexus) repo is the canonical
example app, consuming `@mfkit/*` and doubling as MFKit's integration test.

## License

MIT
