# MFKit

> Polyglot Module Federation, scaffolded and self-healing.

[![CI](https://github.com/RJonMshka/mfkit/actions/workflows/ci.yml/badge.svg)](https://github.com/RJonMshka/mfkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mfkit/kit/alpha?label=%40mfkit%2Fkit)](https://www.npmjs.com/package/@mfkit/kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MFKit turns **one manifest** into a working microfrontend system where each
MFE can use a different framework (React, Svelte, Vue, Angular, Lit). It
generates the Vite + Module Federation config for every app, the shell's
remote map, typed federated imports, and the Turbo dev pipeline. At runtime it
mounts each MFE behind a healing outlet: retry with backoff, then quarantine,
so one broken remote never takes the shell down.

> **Status: alpha.** Phase 1 is complete and runs in CI against a real
> React + Svelte example. The API may change before v0.1. See
> [what works today](#what-works-today).

## 60-second tour

```ts
// mfkit.config.ts — the single source of truth
import { defineConfig } from "@mfkit/kit";

export default defineConfig({
  version: 1,
  name: "my-app",
  shell: { name: "shell", framework: "react", path: "apps/shell" },
  mfes: [
    { name: "mfe_hello", framework: "react", route: "/hello", path: "apps/mfe-hello" },
    { name: "mfe_clock", framework: "svelte", route: "/clock", path: "apps/mfe-clock" },
  ],
});
```

```ts
// apps/mfe-clock/vite.config.ts — one line per app
import { mfkitMFE } from "@mfkit/kit/vite";
import { defineConfig } from "vite";
import config from "../../mfkit.config";

export default defineConfig(({ command }) =>
  mfkitMFE(config, "mfe_clock", { mode: command === "serve" ? "dev" : "build" }),
);
```

```ts
// apps/mfe-clock/src/lifecycle.ts — the only contract an MFE implements
import { defineMFE } from "@mfkit/kit";
import { mount, unmount } from "svelte";
import Clock from "./Clock.svelte";

const instances = new WeakMap<HTMLElement, Record<string, unknown>>();

export default defineMFE({
  mount(el, ctx) {
    instances.set(el, mount(Clock, { target: el, props: { basePath: ctx.basePath } }));
  },
  unmount(el) {
    const i = instances.get(el);
    if (i) void unmount(i);
    instances.delete(el);
  },
});
```

```tsx
// apps/shell/src/App.tsx — mount any MFE, any framework
import { MFKitOutlet, MFKitProvider } from "@mfkit/kit/react";

<MFKitProvider loadRemote={loadRemote} entries={config.mfes}>
  <MFKitOutlet remote="mfe_clock" />
</MFKitProvider>
```

Ports, exposes, remote URLs, and shared singletons are inferred, and each
inference is logged once at dev startup. Anything you set explicitly wins.

**Full walkthrough:** [`docs/integration-guide.md`](docs/integration-guide.md).
**Working code:** [`examples/minimal`](examples/minimal), which runs in CI on
every PR.

## Install

```bash
pnpm add -D @mfkit/kit@alpha @module-federation/vite vite
# plus the Vite plugin for each framework you use, e.g.
pnpm add -D @vitejs/plugin-react @sveltejs/vite-plugin-svelte
```

Every framework dependency is an **optional peer**. A Svelte-only project
never installs React.

## What works today

| Capability | Status |
|---|---|
| Manifest validation with aggregated, path-addressed errors | ✅ |
| Vite + MF config generation for MFEs and shell | ✅ React, Svelte (CI-tested) · Vue, Lit, Angular (adapters exist, not yet CI-tested) |
| Inferred ports / exposes / remote URLs, logged in dev | ✅ |
| Remote CSS travels with the remote entry | ✅ |
| `<MFKitOutlet>`: retry → quarantine, custom slots | ✅ React shells |
| Typed federated imports (`.d.ts` generation + watcher) | ✅ |
| Turbo pipeline generation (`turbo dev` starts all remotes) | ✅ |
| Custom framework adapters via `config.plugins` or `adapters` option | ✅ |
| `mfkit-migrate` CLI | ✅ infrastructure; first codemods land v0.3 |
| Vue / Svelte **shell** outlets | 🔜 v0.2 |
| Plugin `healing`/`discovery`/`setup` hooks, automatic singleton-skew detection | 🧪 typed, not yet wired. See [review O1](docs/project-review-2026-10.md#o1-typed-but-unwired-contract-surface--high) |
| `create-mfkit` scaffolder | 🔜 Phase 2 |

## Packages

| Package | Purpose |
|---|---|
| [`@mfkit/plugin-api`](packages/plugin-api) | The stable contract. Types only; zero runtime. |
| [`@mfkit/kit`](packages/kit) | Runtime and generators: `/vite`, `/react`, `/healing`, `/types`, `/turbo` |
| [`@mfkit/codemods`](packages/codemods) | Upgrade tooling and the `mfkit-migrate` CLI |

## Is MFKit for you?

Microfrontends add coordination cost. If you have one team, one framework,
and one release train, a well-structured monolith is simpler. MFKit is for
teams that **must** mix frameworks (migrations, acquisitions, independent
teams) and want that to be boring. See [`docs/mfe-landscape.md`](docs/mfe-landscape.md)
for the research behind that position.

## Docs

- [Architecture](docs/architecture.md): the 30-second mental model and component map
- [Design decisions](docs/design-decisions.md): why things are the way they are
- [Integration guide](docs/integration-guide.md): wire MFKit into your monorepo
- [Project review (Oct 2026)](docs/project-review-2026-10.md): known issues and roadmap
- [Testing & evaluation plan](docs/testing-and-evaluation.md)
- [Plan](docs/mfekit-plan.md): phases and exit criteria

## Contributing

Bug reports with reproductions and fixes with regression tests are the most
valuable contributions right now. Start with [CONTRIBUTING.md](CONTRIBUTING.md).
Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report
vulnerabilities privately per [SECURITY.md](SECURITY.md).

```bash
pnpm install && pnpm build && pnpm test
pnpm --filter mfkit-example-minimal e2e   # headless Chrome against the example
```

## License

[MIT](LICENSE) © Rajat Kumar
