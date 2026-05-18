// Lazy framework-adapter dispatcher.
//
// Built-in adapters live in `dist/vite-adapters/*.js` as separate tsup
// entries. Loading is done through a computed-path dynamic import so esbuild
// leaves the lazy boundary intact — only the adapter for the framework a
// manifest actually references is read off disk.
//
// User-supplied adapters (via MFKitPlugin.frameworkAdapters or the
// `adapters` option on mfkitMFE/mfkitShell) always win over built-ins.

import type { FrameworkAdapter, FrameworkId } from "@mfkit/plugin-api";

import { MFKitConfigError } from "../index.js";

const BUILTIN_IDS = new Set<string>(["react", "svelte", "vue", "lit", "angular"]);

interface AdapterModule {
  readonly default: FrameworkAdapter;
}

// Variable-arg dynamic import. esbuild won't glob-expand `import(arg)` when
// the path is a function parameter (only template literals get inlined), so
// the adapter files survive as their own entry chunks. Runtime resolution
// happens via the absolute URL we compute from import.meta.url.
function dynamicImport(url: string): Promise<unknown> {
  return import(url);
}

export async function resolveAdapter(
  id: FrameworkId,
  supplied: readonly FrameworkAdapter[] = [],
): Promise<FrameworkAdapter> {
  const explicit = supplied.find((a) => a.id === id);
  if (explicit) return explicit;

  if (!BUILTIN_IDS.has(id)) {
    throw new MFKitConfigError(
      `No FrameworkAdapter for "${id}". Built-ins: ${[...BUILTIN_IDS].join(", ")}. ` +
        `Register a custom adapter via MFKitPlugin.frameworkAdapters or pass it to mfkitMFE({ adapters }).`,
      [{ path: "framework", message: `Unknown framework "${id}"` }],
    );
  }

  const slug = id;
  try {
    const url = new URL(`./vite-adapters/${slug}.js`, import.meta.url).href;
    const mod = (await dynamicImport(url)) as AdapterModule;
    return mod.default;
  } catch (err) {
    const hint = peerInstallHint(id, err);
    if (hint) {
      throw new MFKitConfigError(hint, [
        { path: "framework", message: `Missing peer dependency for "${id}" adapter` },
      ]);
    }
    throw err;
  }
}

const PEER_BY_ID: Readonly<Record<string, string | undefined>> = {
  react: "@vitejs/plugin-react",
  svelte: "@sveltejs/vite-plugin-svelte",
  vue: "@vitejs/plugin-vue",
  angular: "@analogjs/vite-plugin-angular",
  lit: undefined,
};

function peerInstallHint(id: FrameworkId, err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const peer = PEER_BY_ID[id];
  if (!peer) return null;
  if (!err.message.includes(peer)) return null;
  return (
    `Framework adapter "${id}" needs ${peer} installed.\n` +
    `  pnpm add -D ${peer}\n` +
    `Underlying error: ${err.message}`
  );
}
