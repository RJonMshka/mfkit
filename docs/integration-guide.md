# MFKit — Integration Guide

> The shortest path from "empty repo" to "running polyglot MFE app on
> MFKit." Built for devs, not for spec readers. Skim the headings, follow
> the snippets, read the *why* lines if you want the reasoning.

**Phase 1 caveat:** the CLI scaffolder (`create-mfkit`) ships in Phase 2.
Until then, you wire the workspace by hand following this guide. It is not
hard — there are ~6 files to author once, regardless of how many MFEs.

---

## What you need

- Node ≥ 20, pnpm ≥ 10.
- A monorepo. pnpm workspaces + Turbo recommended (kit assumes this layout
  in the Turbo generator), but any setup that ships per-package `package.json`s
  with names will work.

Install the alpha packages from your workspace root:

```bash
pnpm add -DW @mfkit/kit @mfkit/plugin-api
pnpm add -DW @module-federation/vite vite              # required peer
# Plus the framework Vite plugin for each MFE framework you use:
pnpm add -DW @vitejs/plugin-react                       # if any React MFE
pnpm add -DW @vitejs/plugin-vue                         # if any Vue MFE
pnpm add -DW @sveltejs/vite-plugin-svelte               # if any Svelte MFE
pnpm add -DW @analogjs/vite-plugin-angular              # if any Angular MFE
# (Lit needs no extra plugin.)
```

---

## Step 1 — Author `mfkit.config.ts`

One file at your repo root. Declarative, no behavior. Every other generator
reads this.

```ts
// mfkit.config.ts
import { defineConfig, MFKIT_CONFIG_VERSION } from "@mfkit/kit";

export default defineConfig({
  version: MFKIT_CONFIG_VERSION,
  name: "my-app",

  shell: {
    name: "shell",                    // MF host name; must be valid JS identifier
    framework: "react",               // picks the adapter
    path: "apps/shell",               // workspace-relative
    port: 3000,                       // optional; defaults to 3000
    shared: {
      "react-router-dom": { singleton: true, requiredVersion: "^6.0.0" },
    },
  },

  mfes: [
    {
      name: "mfe_metrics",            // MF remote name; valid JS identifier (no kebab)
      framework: "svelte",
      route: "/metrics",
      path: "apps/mfe-metrics",
      // port omitted → adapter default (or auto-assigned in 5173..5273)
    },
    {
      name: "mfe_config",
      framework: "lit",
      route: "/config",
      path: "apps/mfe-config",
    },
  ],

  // Optional: shared deps every MFE inherits. Per-MFE shared wins on collision.
  shared: {
    "@my-org/shared": { singleton: true },
  },
});
```

**What `defineConfig` does:**
- Validates the shape (Valibot).
- Checks duplicate name / port / route across MFEs.
- Throws `MFKitConfigError` with every issue at once if invalid.
- Returns the same object on success.

**The naming rule that bites everyone once:** `name` (both shell and MFE)
must be a valid JS identifier. `mfe_metrics` works, `mfe-metrics` does not.
This is an MF constraint — the federated module path becomes
`import x from "mfe_metrics/lifecycle"`.

---

## Step 2 — Write each MFE's lifecycle

Every MFE exposes the same shape: a default export from `src/lifecycle.ts`
that `defineMFE()` validates.

```ts
// apps/mfe-metrics/src/lifecycle.ts
import { defineMFE, type MFEContext } from "@mfkit/kit";

// Whatever your framework's mount/unmount looks like internally.
import { mount as svelteMount, unmount as svelteUnmount } from "./app";

export default defineMFE({
  mount(el: HTMLElement, ctx: MFEContext, props?: Record<string, unknown>) {
    // ctx.basePath = "/metrics" (your route, MFKit-injected)
    // ctx.mountId  = unique per mount instance
    // ctx.signal   = aborts if the host unmounts before mount resolves
    return svelteMount(el, { ...ctx, ...props });
  },
  unmount(el: HTMLElement) {
    return svelteUnmount(el);
  },
});
```

**Three things to know about the contract:**
1. `mount` and `unmount` may be sync or async. The host awaits both.
2. `MFEContext` is MFKit's channel (route, ID, abort). `props` is yours —
   anything the shell passes through `<MFKitOutlet props={...}>`.
3. Honor `ctx.signal`. If it aborts during async setup, resolve without
   rendering — the host has moved on.

---

## Step 3 — Wire each MFE's `vite.config.ts`

```ts
// apps/mfe-metrics/vite.config.ts
import { defineConfig } from "vite";
import { mfkitMFE } from "@mfkit/kit/vite";
import config from "../../mfkit.config";

export default defineConfig(async () => {
  return mfkitMFE(config, "mfe_metrics", {
    mode: process.env.NODE_ENV === "production" ? "build" : "dev",
  });
});
```

That's the whole file. `mfkitMFE`:

- Looks up the entry by name (throws with a friendly list if you typo).
- Resolves the framework adapter (`svelte` → loads `vite-adapters/svelte.js`).
- Fills in `port`, `exposes` (`{ "./lifecycle": "./src/lifecycle.ts" }`),
  `remoteEntry.js`, and the composed `shared` map.
- Lazy-loads `@module-federation/vite` and returns a `UserConfig`.

**If you need to extend it** (extra plugins, custom server options):

```ts
import { defineConfig, mergeConfig } from "vite";

export default defineConfig(async () => {
  const base = await mfkitMFE(config, "mfe_metrics");
  return mergeConfig(base, {
    plugins: [/* your extras */],
    server: { proxy: { /* your proxies */ } },
  });
});
```

---

## Step 4 — Wire the shell's `vite.config.ts`

```ts
// apps/shell/vite.config.ts
import { defineConfig } from "vite";
import { mfkitShell } from "@mfkit/kit/vite";
import config from "../../mfkit.config";

export default defineConfig(async () => {
  return mfkitShell(config, {
    mode: process.env.NODE_ENV === "production" ? "build" : "dev",
  });
});
```

`mfkitShell`:

- Adapter for the shell's framework (`react` in our example).
- Builds the remotes map (`mfe_metrics: "http://localhost:5174/remoteEntry.js"`
  in dev; uses `entry.origin` in production builds).
- Composes shared singletons across adapter defaults + manifest + shell-only.
- Returns the shell's Vite `UserConfig`.

---

## Step 5 — Mount MFEs in the shell

In your shell's React entry, wrap your tree in `<MFKitProvider>` and drop
`<MFKitOutlet>` wherever you'd render the MFE.

```tsx
// apps/shell/src/main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MFKitProvider, MFKitOutlet } from "@mfkit/kit/react";
import { loadRemote } from "@module-federation/enhanced/runtime";
import config from "../../../mfkit.config";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <MFKitProvider
      loadRemote={loadRemote}
      entries={config.mfes}
    >
      <Routes>
        <Route path="/metrics/*" element={<MFKitOutlet remote="mfe_metrics" />} />
        <Route path="/config/*"  element={<MFKitOutlet remote="mfe_config"  />} />
      </Routes>
    </MFKitProvider>
  </BrowserRouter>
);
```

**What's happening:**

- `<MFKitProvider>` supplies the host-wide `loadRemote`, default healing
  strategy (forgiving), shared quarantine registry, and the manifest
  entries map.
- `<MFKitOutlet remote="mfe_metrics" />` resolves `mfe_metrics` from the
  provider's entries, owns a stable mount container, and runs the
  load → mount → unmount cycle through `runWithHealing`.

**Custom loading / error UI:**

```tsx
<MFKitOutlet
  remote="mfe_metrics"
  loadingFallback={<MyFancySpinner />}
  errorFallback={({ entry, error, retry }) => (
    <Card title={`${entry.name} failed`}>
      <p>{error.message}</p>
      <button onClick={retry}>Retry</button>
    </Card>
  )}
  retryingFallback={({ attempt, nextDelayMs }) => (
    <span>Retrying ({attempt}, next in {nextDelayMs}ms)…</span>
  )}
  quarantinedFallback={({ reason, retry }) => (
    <Card title="MFE quarantined">{reason}<button onClick={retry}>Try again</button></Card>
  )}
/>
```

Slots take either a `ReactNode` or a `(info) => ReactNode` function.

**Pass props to the MFE:**

```tsx
<MFKitOutlet remote="mfe_metrics" props={{ userId, locale }} />
// → mount(el, ctx, { userId, locale })
```

---

## Step 6 — Generate remote types (one-time + watcher)

The shell's `import lifecycle from "mfe_metrics/lifecycle"` needs an ambient
`.d.ts` declaration. MFKit generates it for you.

**One-shot generation** (e.g. in CI or as a `prebuild` script):

```ts
// scripts/gen-types.ts
import { writeRemoteTypes } from "@mfkit/kit/types";
import config from "../mfkit.config";

await writeRemoteTypes(config);
// Writes .mfkit/generated/remotes.d.ts (idempotent — skips when unchanged)
```

Add to your shell `tsconfig.json`:

```json
{
  "include": ["src", "../../.mfkit/generated/remotes.d.ts"]
}
```

`.gitignore` the generated tree:

```
.mfkit/generated/
```

**Watcher** for dev mode (regenerates whenever you save the config):

```ts
// scripts/watch-types.ts
import { watchRemoteTypes } from "@mfkit/kit/types";
import config from "../mfkit.config";

const watcher = watchRemoteTypes(config, {
  watchPaths: ["mfkit.config.ts"],
  reload: async () => (await import("../mfkit.config?t=" + Date.now())).default,
});
```

Wire it into your dev script alongside `vite dev`.

---

## Step 7 — Generate `turbo.json`

If you use Turbo, derive your `turbo.json` from the manifest. This keeps
the pipeline aligned with the MFE list automatically.

```ts
// scripts/gen-turbo.ts
import { writeFileSync } from "node:fs";
import { generateTurboConfig } from "@mfkit/kit/turbo";
import config from "../mfkit.config";

const turbo = generateTurboConfig(config);
writeFileSync("turbo.json", JSON.stringify(turbo, null, 2) + "\n");
```

What you get:

- Base tasks: `build`, `dev`, `test`, `typecheck`, `clean`.
- `<shell-pkg>#dev` that `dependsOn` every `<mfe-pkg>#dev`. So
  `turbo run dev --filter shell` brings the remotes up first.

Pass `orchestrateShellDev: false` if you don't want that orchestration.

Each package referenced by the manifest must have a `package.json` with a
`name` — Turbo identifies workspaces by name, kit reads it from disk.

---

## Step 8 — Pick a healing strategy

The default is **forgiving**: retry with exponential backoff (3 attempts,
200ms → 400ms → 800ms, capped at 5s), then quarantine. Warn on singleton
version mismatch.

You almost never need to touch this in dev. In production you might:

**Per-host override** (everything in the tree):

```tsx
import { strictStrategy } from "@mfkit/kit/healing";

<MFKitProvider strategy={strictStrategy()} loadRemote={loadRemote}>
  …
</MFKitProvider>
```

**Per-outlet override** (this one MFE):

```tsx
import { forgivingStrategy } from "@mfkit/kit/healing";

<MFKitOutlet
  remote="mfe_critical"
  healing={forgivingStrategy({ maxAttempts: 10, initialDelayMs: 1000 })}
/>
```

**Manifest default:**

```ts
defineConfig({
  // …
  healing: forgivingStrategy({ maxAttempts: 5 }),
});
```

The three nesting levels: config → provider → outlet. Most specific wins.

---

## Step 9 — Last-known-good manifest cache (optional)

When the MF manifest fetch fails (network blip, CDN hiccup), kit can serve
the previously cached one and mark the result `stale: true` so you can show
a degraded-mode banner.

```ts
import { createManifestCache } from "@mfkit/kit/healing";

const cache = createManifestCache<MFManifest>({
  // storage defaults to in-memory; wire localStorage at the boundary:
  storage: {
    get:    (k) => localStorage.getItem(k),
    set:    (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  },
});

const { value, stale, error } = await cache.load("mf-manifest", () =>
  fetch("/api/mf-manifest").then((r) => r.json()),
);
if (stale) showBanner("Showing cached MFE manifest", error);
```

---

## What you author vs. what MFKit generates

| File | Author? | Generator |
|---|---|---|
| `mfkit.config.ts` | ✅ you author once | — |
| `apps/<mfe>/src/lifecycle.ts` | ✅ one per MFE | — |
| `apps/<mfe>/vite.config.ts` | ✅ ~5 lines | `mfkitMFE` produces the actual config |
| `apps/shell/vite.config.ts` | ✅ ~5 lines | `mfkitShell` produces the actual config |
| `apps/shell/src/main.tsx` | ✅ shell entry | — |
| `turbo.json` | regenerated | `generateTurboConfig` |
| `.mfkit/generated/remotes.d.ts` | regenerated | `generateRemoteTypes` |

Adding a new MFE is: add a `mfes` entry, scaffold the package folder, write
a `lifecycle.ts`, write a 5-line `vite.config.ts`, re-run the type generator.

---

## A complete `package.json` script set (recommended)

At the workspace root:

```json
{
  "scripts": {
    "gen:types": "tsx scripts/gen-types.ts",
    "gen:turbo": "tsx scripts/gen-turbo.ts",
    "gen": "pnpm gen:turbo && pnpm gen:types",
    "predev": "pnpm gen",
    "prebuild": "pnpm gen",
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  }
}
```

`predev` / `prebuild` ensure generated artifacts are fresh before tooling
runs.

---

## Troubleshooting checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| `Unknown framework "X"` | No adapter for `X` | Use a built-in (`react`/`svelte`/`vue`/`angular`/`lit`) or register a custom one via `MFKitPlugin.frameworkAdapters` |
| `@module-federation/vite is not installed` | Peer missing | `pnpm add -DW @module-federation/vite` |
| `Framework adapter "react" needs @vitejs/plugin-react` | Framework peer missing | Install the named package as a dev dep |
| `Duplicate MFE name / port / route` | Two entries collide | Pick unique values; cross-field validator says exactly which entries |
| `port must be a valid JS identifier` etc. | Schema violation | Read the aggregated `MFKitConfigError.issues` — every problem at once |
| Shell typecheck: `Cannot find module "mfe_X/lifecycle"` | `.d.ts` not generated or not in tsconfig `include` | Run `gen:types`, add `.mfkit/generated/remotes.d.ts` to `include` |
| MFE never mounts, no error | Probably quarantined silently | Read browser console, or set `<MFKitOutlet quarantinedFallback={...}>` |
| Mount succeeds locally, blank in production build | `entry.origin` not set; remotes resolve to localhost | Set `origin` on each MFE entry for production builds |

---

## Where to read more

- [`architecture.md`](./architecture.md) — full component map with IO.
- [`design-decisions.md`](./design-decisions.md) — *why* each load-bearing
  choice is the way it is.
- [`mfekit-plan.md`](./mfekit-plan.md) — the phase roadmap. Useful if you're
  trying to predict what's next.
