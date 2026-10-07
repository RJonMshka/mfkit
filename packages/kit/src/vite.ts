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

import { existsSync } from "node:fs";

import type {
  AdapterMode,
  FrameworkAdapter,
  MFKitConfig,
  SharedDependencyMap,
} from "@mfkit/plugin-api";
import type { Plugin, UserConfig } from "vite";

import { MFKitConfigError } from "./index.js";
import { resolveConfig } from "./resolve.js";
import { resolveAdapter } from "./vite/adapter-resolve.js";
import { cssInjectedByJs } from "./vite/css-inject.js";
import { deriveMFE, deriveShell, findMFE } from "./vite/derive.js";
import { logInferred } from "./vite/inference-log.js";

export interface MFKitViteOptions {
  /** Working directory the adapter resolves relative paths from. Defaults to process.cwd(). */
  readonly cwd?: string;
  /**
   * Workspace root handed to discovery strategies (`DiscoveryContext.cwd`).
   * Vite runs per app, so `cwd` is usually the app's folder; set this when a
   * discovery strategy scans the workspace. Defaults to `cwd`.
   */
  readonly root?: string;
  /** dev → middleware mode, fallback localhost URLs. build → production. Defaults to "build". */
  readonly mode?: AdapterMode;
  /** Adapters that win over built-ins. Useful for custom frameworks or stubbing in tests. */
  readonly adapters?: readonly FrameworkAdapter[];
  /** Print the once-per-process dev-mode inference log. Defaults true; pass false to silence it. */
  readonly logInferred?: boolean;
  /**
   * Fold an MFE's built CSS into its entry chunks so styles travel with the
   * remote instead of being stranded in an asset only its own index.html
   * references. Defaults true — federated remotes render unstyled without it.
   * Set false if the host owns all styling (e.g. a shared design-system
   * stylesheet) and you want to drop the duplicate bytes. Ignored by
   * `mfkitShell` (a shell loads its own HTML).
   */
  readonly injectCss?: boolean;
  /**
   * Module Federation share strategy for the shell. Defaults to
   * `"loaded-first"`: the shell's own singletons are used and remotes are
   * fetched only when an outlet asks for them. The MF default,
   * `"version-first"`, fetches *every* remote entry during startup to pick the
   * highest shared version — so one slow or hanging remote held the whole
   * shell's first render hostage (review R10). Ignored by `mfkitMFE`.
   */
  readonly shareStrategy?: "loaded-first" | "version-first";
}

export async function mfkitMFE(
  config: MFKitConfig,
  name: string,
  opts: MFKitViteOptions = {},
): Promise<UserConfig> {
  const mode = opts.mode ?? "build";
  const cwd = opts.cwd ?? process.cwd();
  const logEnabled = opts.logInferred ?? true;

  const manifest = await resolveConfig(config, { cwd: opts.root ?? cwd });
  const entry = findMFE(manifest, name);
  const adapter = await resolveAdapter(entry.framework, [
    ...(opts.adapters ?? []),
    ...manifest.adapters,
  ]);
  const resolved = deriveMFE(manifest, entry, adapter, { cwd, exists: existsSync });

  const federation = await loadFederation();
  const frameworkPlugins = adapter.plugins({ entry, mode, cwd }) as readonly Plugin[];

  const mfPlugin = federation({
    name: entry.name,
    filename: resolved.remoteEntryFile,
    exposes: { ...resolved.exposes },
    shared: toMFShared(resolved.shared),
    dts: false,
  });

  logInferred(entry.name, resolved.inferred, { mode, enabled: logEnabled });

  const cssPlugins = (opts.injectCss ?? true) ? [cssInjectedByJs({ remoteName: entry.name })] : [];

  const config_: UserConfig = {
    server: { port: resolved.port, strictPort: true },
    preview: { port: resolved.port, strictPort: true },
    build: { target: "esnext", modulePreload: false, cssCodeSplit: false },
    plugins: [...frameworkPlugins, ...asPluginArray(mfPlugin), ...cssPlugins],
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

  // Resolved, so MFEs contributed by discovery land in the remotes map.
  const manifest = await resolveConfig(config, { cwd: opts.root ?? cwd });
  const adapter = await resolveAdapter(config.shell.framework, [
    ...(opts.adapters ?? []),
    ...manifest.adapters,
  ]);
  const resolved = deriveShell(manifest, adapter, { mode });

  const federation = await loadFederation();
  const frameworkPlugins = adapter.plugins({
    entry: shellAsEntry(config),
    mode,
    cwd,
  }) as readonly Plugin[];

  // `dts: false`: the MF plugin's own dts machinery pulls in
  // dynamic-remote-type-hints-plugin, which Vite then fails to pre-bundle and
  // warns about on every dev boot (dx-findings #6). Kit owns remote types via
  // `@mfkit/kit/types` — this is redundant work producing a scary log line.
  const mfPlugin = federation({
    name: config.shell.name,
    remotes: toMFRemotes(resolved.remotes),
    shared: toMFShared(resolved.shared),
    shareStrategy: opts.shareStrategy ?? "loaded-first",
    dts: false,
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
