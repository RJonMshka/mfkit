// resolveConfig — the one place a manifest becomes the config every generator
// and runtime piece consumes (review A1).
//
// Before this, `config.plugins`, `config.discovery`, and plugin `setup` hooks
// were typed but nothing ran them, and each entry point read the raw manifest
// on its own. Now:
//
//   1. validate                (defineConfig rules)
//   2. collect plugin surfaces (adapters, healing, discovery, setup)
//   3. run discovery           manifest entries first and never overridden
//                              (invariant 4: user values win); discovered
//                              entries are added, later strategies win ties
//   4. re-validate the merged manifest (ports/routes/names stay unique)
//   5. run every plugin `setup` once, in order
//
// Memoized per input object, so the many callers in one process (each Vite
// config, generators, the shell) resolve — and run discovery/setup — once.
// Build-time only: discovery strategies may touch the filesystem.

import type {
  DiscoveryStrategy,
  FrameworkAdapter,
  HealingStrategy,
  MFEManifestEntry,
  MFKitConfig,
} from "@mfkit/plugin-api";

import { defineConfig, MFKitConfigError, type MFKitConfigIssue } from "./index.js";

export interface ResolvedMFKitConfig extends MFKitConfig {
  /** Manifest entries plus everything discovery contributed. */
  readonly mfes: readonly MFEManifestEntry[];
  /**
   * The strategy in effect: `config.healing`, else the last plugin's
   * `healing`, else undefined (consumers fall back to `forgivingStrategy()`).
   */
  readonly healing?: HealingStrategy;
  /** Adapters from plugins, highest precedence first (later plugins win). */
  readonly adapters: readonly FrameworkAdapter[];
  /** Names of entries that came from discovery rather than the manifest. */
  readonly discovered: readonly string[];
}

export interface ResolveConfigOptions {
  /** Workspace root handed to discovery strategies. Defaults to process.cwd(). */
  readonly cwd?: string;
}

const cache = new WeakMap<MFKitConfig, Promise<ResolvedMFKitConfig>>();
const RESOLVED = Symbol.for("mfkit.resolved");

/** Resolve (once per config object) the manifest every MFKit consumer uses. */
export function resolveConfig(
  config: MFKitConfig,
  opts: ResolveConfigOptions = {},
): Promise<ResolvedMFKitConfig> {
  // Already resolved? Hand it back — callers may pass either shape.
  if (isResolved(config)) return Promise.resolve(config);
  let pending = cache.get(config);
  if (!pending) {
    pending = resolveUncached(config, opts.cwd ?? process.cwd());
    cache.set(config, pending);
    // A failed resolution must not be memoized: fixing the manifest in a
    // long-running dev process and calling again should retry.
    pending.catch(() => cache.delete(config));
  }
  return pending;
}

/** Test-only: forget memoized resolutions. */
export function _resetResolveCache(config: MFKitConfig): void {
  cache.delete(config);
}

async function resolveUncached(config: MFKitConfig, cwd: string): Promise<ResolvedMFKitConfig> {
  defineConfig(config);

  const plugins = config.plugins ?? [];
  const issues: MFKitConfigIssue[] = [];

  plugins.forEach((p, i) => {
    if (!p || typeof p !== "object" || typeof p.name !== "string" || p.name === "") {
      issues.push({
        path: `plugins[${i}]`,
        message: "plugin must be an object with a non-empty `name`",
      });
      return;
    }
    if (p.healing !== undefined) checkHealing(p.healing, `plugins[${i}].healing`, issues);
    if (p.discovery !== undefined) checkDiscovery(p.discovery, `plugins[${i}].discovery`, issues);
    if (p.setup !== undefined && typeof p.setup !== "function") {
      issues.push({ path: `plugins[${i}].setup`, message: "setup must be a function" });
    }
  });
  if (config.healing !== undefined) checkHealing(config.healing, "healing", issues);
  if (config.discovery !== undefined) checkDiscovery(config.discovery, "discovery", issues);
  if (issues.length > 0) throw aggregate(issues);

  const healing = config.healing ?? lastDefined(plugins.map((p) => p.healing));
  const adapters = [...plugins].reverse().flatMap((p) => p.frameworkAdapters ?? []);

  // Discovery: config.discovery first, then plugins in order. Later strategies
  // win ties among *discovered* entries; manifest entries are never replaced.
  const strategies: DiscoveryStrategy[] = [
    ...(config.discovery ? [config.discovery] : []),
    ...plugins.flatMap((p) => (p.discovery ? [p.discovery] : [])),
  ];
  const declared = new Set(config.mfes.map((m) => m.name));
  const discoveredByName = new Map<string, MFEManifestEntry>();
  for (const strategy of strategies) {
    let found: readonly MFEManifestEntry[];
    try {
      found = await strategy.discover({ cwd, config });
    } catch (err) {
      throw new MFKitConfigError(
        `Discovery strategy "${strategy.id}" failed: ${err instanceof Error ? err.message : String(err)}`,
        [{ path: "discovery", message: `strategy "${strategy.id}" threw` }],
      );
    }
    for (const entry of found) {
      if (declared.has(entry.name)) continue;
      discoveredByName.set(entry.name, entry);
    }
  }

  const mfes = [...config.mfes, ...discoveredByName.values()];
  const merged: MFKitConfig = { ...config, mfes };
  // Discovered entries go through the same rules as declared ones.
  if (discoveredByName.size > 0) defineConfig(merged);

  const resolved: ResolvedMFKitConfig = Object.freeze({
    ...merged,
    mfes,
    ...(healing !== undefined ? { healing } : {}),
    adapters,
    discovered: [...discoveredByName.keys()],
    [RESOLVED]: true,
  });

  for (const p of plugins) {
    if (p.setup) await p.setup(resolved);
  }
  return resolved;
}

function isResolved(config: MFKitConfig): config is ResolvedMFKitConfig {
  return (config as unknown as Record<symbol, unknown>)[RESOLVED] === true;
}

function lastDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== undefined) return v;
  }
  return undefined;
}

// Function-valued surfaces resist schema validation at the config boundary
// (see index.ts), so they are shape-checked here, where they are consumed.
function checkHealing(h: unknown, path: string, issues: MFKitConfigIssue[]): void {
  const s = h as Partial<Record<keyof HealingStrategy, unknown>> | null;
  if (!s || typeof s !== "object") {
    issues.push({ path, message: "healing must be a HealingStrategy object" });
    return;
  }
  if (typeof s.id !== "string") issues.push({ path: `${path}.id`, message: "id must be a string" });
  for (const fn of ["onLoadError", "onMountError", "onVersionMismatch"] as const) {
    if (typeof s[fn] !== "function")
      issues.push({ path: `${path}.${fn}`, message: `${fn} must be a function` });
  }
  if (typeof s.maxAttempts !== "number" || !Number.isInteger(s.maxAttempts) || s.maxAttempts < 1) {
    issues.push({ path: `${path}.maxAttempts`, message: "maxAttempts must be an integer >= 1" });
  }
}

function checkDiscovery(d: unknown, path: string, issues: MFKitConfigIssue[]): void {
  const s = d as Partial<Record<keyof DiscoveryStrategy, unknown>> | null;
  if (!s || typeof s !== "object" || typeof s.id !== "string" || typeof s.discover !== "function") {
    issues.push({
      path,
      message: "discovery must be { id: string, discover: (ctx) => Promise<entries> }",
    });
  }
}

function aggregate(issues: readonly MFKitConfigIssue[]): MFKitConfigError {
  const lines = issues.map((i) => `  • ${i.path}: ${i.message}`);
  return new MFKitConfigError(
    `Invalid MFKit plugins/strategies (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n${lines.join("\n")}`,
    issues,
  );
}
