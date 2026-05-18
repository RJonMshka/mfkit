/**
 * Manifest types — the host's declarative source of truth.
 *
 * A single `mfkit.config.ts` at the consumer's repo root declares every MFE,
 * the shell, shared dependencies, budgets, and pluggable strategies. Vite
 * configs, Turbo pipelines, route maps, and TypeScript bindings are derived
 * from this manifest. Hand-edits to generated files are explicit escape
 * hatches, not the norm.
 */

import type { DiscoveryStrategy } from "./discovery.js";
import type { HealingStrategy } from "./healing.js";
import type { MFKitPlugin } from "./plugin.js";

/**
 * The current MFKit config schema version. Codemods dispatch on this number;
 * bumping it requires registering a migration in `@mfkit/codemods`.
 */
export const MFKIT_CONFIG_VERSION = 1 as const;

/**
 * Framework identifier. Built-in adapters cover the polyglot baseline;
 * plugin authors may register additional IDs via `FrameworkAdapter`.
 *
 * The `(string & {})` intersection preserves IDE autocomplete for the literal
 * union while still admitting arbitrary plugin-supplied strings.
 */
export type FrameworkId =
  | "react"
  | "svelte"
  | "vue"
  | "angular"
  | "lit"
  | (string & {});

/**
 * Module Federation shared-dependency configuration, normalized for MFKit.
 *
 * Mirrors the subset of `@module-federation/vite` shape that adapters care
 * about. Adapters translate this to their underlying bundler's contract.
 */
export interface SharedDependency {
  readonly singleton?: boolean;
  readonly strictVersion?: boolean;
  readonly requiredVersion?: string;
  readonly eager?: boolean;
}

/** A map of package names → shared-dep config. */
export type SharedDependencyMap = Readonly<Record<string, SharedDependency>>;

/**
 * A single MFE's manifest entry — declarative, no behavior. The MFE's runtime
 * behavior is supplied separately via `defineMFE()` inside the MFE package.
 */
export interface MFEManifestEntry {
  /** Module Federation remote name, e.g. `"mfe_metrics"`. Kebab-case is not allowed. */
  readonly name: string;
  /** URL segment owned by this MFE, e.g. `"/metrics"`. */
  readonly route: string;
  /** Framework this MFE is built with. Picks the adapter. */
  readonly framework: FrameworkId;
  /** Workspace-relative path to the MFE package, e.g. `"apps/mfe-metrics"`. */
  readonly path: string;
  /** Dev-server port. Omit to let MFKit auto-assign in the safe range. */
  readonly port?: number;
  /** Production origin override. Falls back to dev port when absent. */
  readonly origin?: string;
  /** Remote entry filename. Defaults to `"remoteEntry.js"`. */
  readonly remoteEntry?: string;
  /** Override the exposed module map. Defaults to `{ "./lifecycle": "./src/lifecycle.ts" }`. */
  readonly exposes?: Readonly<Record<string, string>>;
  /** Shared deps in addition to the host-level defaults. */
  readonly shared?: SharedDependencyMap;
  /** Display label shown in nav, loading, error states. Defaults to `name`. */
  readonly label?: string;
  /** Accessible description for nav tooltips and a11y. */
  readonly description?: string;
  /** Per-MFE bundle budget in gzipped bytes. Enforced in CI when present. */
  readonly budgetBytes?: number;
}

/**
 * Shell configuration. The shell is the host application — it has remotes but
 * exposes nothing. Exactly one shell per manifest.
 */
export interface ShellConfig {
  /** Module Federation host name. */
  readonly name: string;
  /** Workspace-relative path to the shell package. */
  readonly path: string;
  /** Shell framework. Used to pick the React/Vue/etc. outlet implementation. */
  readonly framework: FrameworkId;
  /** Shell dev-server port. Defaults to 3000. */
  readonly port?: number;
  /** Production origin override. */
  readonly origin?: string;
  /** Initial bundle budget for the shell alone (no MFEs mounted). */
  readonly budgetBytes?: number;
  /**
   * Host-specific shared singletons (e.g. `react-router-dom`). Framework
   * baseline singletons (`react`, `react-dom`) belong to the framework
   * adapter's `defaultShared`. App-wide singletons (like `@devnexus/shared`)
   * belong on `MFKitConfig.shared`. This is for shell-only host deps.
   */
  readonly shared?: SharedDependencyMap;
}

/**
 * The root MFKit configuration object. Authored as `mfkit.config.ts` via
 * `defineConfig()` from `@mfkit/kit`.
 */
export interface MFKitConfig {
  /** Schema version. Required so codemods can migrate forward. */
  readonly version: typeof MFKIT_CONFIG_VERSION;
  /** Host project name — surfaces in logs, manifest filenames, build output. */
  readonly name: string;
  /** The shell host. Exactly one. */
  readonly shell: ShellConfig;
  /** All federated MFEs. Order is insignificant; routes resolve via `route`. */
  readonly mfes: readonly MFEManifestEntry[];
  /** Shared deps every MFE inherits. Per-MFE entries override individual keys. */
  readonly shared?: SharedDependencyMap;
  /** Optional bundle budgets. Keys are scope identifiers (e.g. `"shell-initial"`). */
  readonly budgets?: Readonly<Record<string, number>>;
  /** Healing strategy override. Defaults to MFKit's forgiving strategy. */
  readonly healing?: HealingStrategy;
  /** Discovery strategy override. Defaults to the manifest-driven strategy. */
  readonly discovery?: DiscoveryStrategy;
  /** Plugins extend any of the pluggable surfaces. Applied in order. */
  readonly plugins?: readonly MFKitPlugin[];
}
