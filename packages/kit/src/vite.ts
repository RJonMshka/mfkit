// @mfkit/kit/vite — UserConfig generation from mfkit.config.ts.
//
// Two public helpers:
//   - mfkitMFE(config, name, opts?)  → per-MFE UserConfig
//   - mfkitShell(config, opts?)      → shell UserConfig
//
// Both are async — they lazy-import the framework adapter that matches the
// manifest entry's `framework` so consumers only pay for what they use. The
// returned config can be returned from Vite's `defineConfig` directly or
// merged with hand-written overrides via `mergeConfig`.

import type {
  AdapterMode,
  FrameworkAdapter,
  MFKitConfig,
  SharedDependencyMap,
} from "@mfkit/plugin-api";
import type { Plugin, UserConfig } from "vite";

import { MFKitConfigError } from "./index.js";
import { resolveAdapter } from "./vite/adapter-resolve.js";
import { deriveMFE, deriveShell, findMFE } from "./vite/derive.js";
import { logInferred } from "./vite/inference-log.js";

export interface MFKitViteOptions {
  /** Working directory the adapter resolves relative paths from. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** dev → middleware mode, fallback localhost URLs. build → production. Defaults to "build". */
  readonly mode?: AdapterMode;
  /** Adapters that win over built-ins. Useful for custom frameworks or stubbing in tests. */
  readonly adapters?: readonly FrameworkAdapter[];
  /** Suppress the dev-mode inference log. Defaults true. */
  readonly logInferred?: boolean;
}

export async function mfkitMFE(
  config: MFKitConfig,
  name: string,
  opts: MFKitViteOptions = {},
): Promise<UserConfig> {
  const mode = opts.mode ?? "build";
  const cwd = opts.cwd ?? process.cwd();
  const logEnabled = opts.logInferred ?? true;

  const entry = findMFE(config, name);
  const adapter = await resolveAdapter(entry.framework, opts.adapters);
  const resolved = deriveMFE(config, entry, adapter);

  const federation = await loadFederation();
  const frameworkPlugins = adapter.plugins({ entry, mode, cwd }) as readonly Plugin[];

  const mfPlugin = federation({
    name: entry.name,
    filename: resolved.remoteEntryFile,
    exposes: { ...resolved.exposes },
    shared: toMFShared(resolved.shared),
  });

  logInferred(entry.name, resolved.inferred, { mode, enabled: logEnabled });

  const config_: UserConfig = {
    server: { port: resolved.port, strictPort: true },
    preview: { port: resolved.port, strictPort: true },
    build: { target: "esnext", modulePreload: false, cssCodeSplit: false },
    plugins: [...frameworkPlugins, ...asPluginArray(mfPlugin)],
  };

  if (adapter.optimizeDepsExclude && adapter.optimizeDepsExclude.length > 0) {
    config_.optimizeDeps = { exclude: [...adapter.optimizeDepsExclude] };
  }

  return config_;
}

export async function mfkitShell(
  config: MFKitConfig,
  opts: MFKitViteOptions = {},
): Promise<UserConfig> {
  const mode = opts.mode ?? "build";
  const cwd = opts.cwd ?? process.cwd();
  const logEnabled = opts.logInferred ?? true;

  const adapter = await resolveAdapter(config.shell.framework, opts.adapters);
  const resolved = deriveShell(config, adapter, { mode });

  const federation = await loadFederation();
  const frameworkPlugins = adapter.plugins({
    entry: shellAsEntry(config),
    mode,
    cwd,
  }) as readonly Plugin[];

  const mfPlugin = federation({
    name: config.shell.name,
    remotes: toMFRemotes(resolved.remotes),
    shared: toMFShared(resolved.shared),
  });

  logInferred("shell", resolved.inferred, { mode, enabled: logEnabled });

  const config_: UserConfig = {
    server: { port: resolved.port, strictPort: true },
    preview: { port: resolved.port, strictPort: true },
    build: { target: "esnext", modulePreload: false, cssCodeSplit: false },
    plugins: [...frameworkPlugins, ...asPluginArray(mfPlugin)],
  };

  if (adapter.optimizeDepsExclude && adapter.optimizeDepsExclude.length > 0) {
    config_.optimizeDeps = { exclude: [...adapter.optimizeDepsExclude] };
  }

  return config_;
}

// ─── Internals ──────────────────────────────────────────────────────────────

type FederationFn = (opts: Record<string, unknown>) => Plugin | readonly Plugin[];

async function loadFederation(): Promise<FederationFn> {
  try {
    const mod = (await import("@module-federation/vite")) as unknown as {
      readonly federation: FederationFn;
    };
    return mod.federation;
  } catch (err) {
    throw new MFKitConfigError(
      "@module-federation/vite is not installed. Install it as a dev dependency:\n" +
        "  pnpm add -D @module-federation/vite\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      [
        {
          path: "<peer>",
          message: "missing peer dependency @module-federation/vite",
        },
      ],
    );
  }
}

// Kit-generated remotes are ESM (vite builds module remote entries). The MF
// runtime defaults string remotes to script-injection ("var") loading, which
// throws `Cannot use import statement outside a module` — so every remote is
// declared in object form with an explicit `type: "module"`.
function toMFRemotes(remotes: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(remotes)) {
    out[name] = { type: "module", name, entry };
  }
  return out;
}

function toMFShared(shared: SharedDependencyMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shared)) {
    const v = shared[key];
    if (v) out[key] = { ...v };
  }
  return out;
}

function asPluginArray(p: Plugin | readonly Plugin[]): readonly Plugin[] {
  return Array.isArray(p) ? p : [p as Plugin];
}

function shellAsEntry(config: MFKitConfig) {
  return {
    name: config.shell.name,
    route: "/",
    framework: config.shell.framework,
    path: config.shell.path,
    ...(config.shell.port !== undefined ? { port: config.shell.port } : {}),
    ...(config.shell.origin !== undefined ? { origin: config.shell.origin } : {}),
  } as const;
}
