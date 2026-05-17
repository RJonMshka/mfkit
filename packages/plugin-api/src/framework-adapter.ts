/**
 * Framework adapter contract.
 *
 * Each adapter teaches MFKit how to integrate a framework's build tooling
 * with Module Federation: which Vite plugins to add, which defaults to apply,
 * and how to translate manifest shared-deps into bundler-specific shape.
 *
 * Plugin-api stays bundler-agnostic — `BundlerPlugin` is generic so MFKit's
 * Vite implementation can constrain it to `vite.Plugin`, and a hypothetical
 * future Rspack adapter can do the same with its own type.
 */

import type { FrameworkId, MFEManifestEntry, SharedDependencyMap } from "./manifest.js";

/**
 * Mode the adapter is being invoked in. `dev` includes Vite's middleware
 * stack; `build` is the production bundle path.
 */
export type AdapterMode = "dev" | "build";

/**
 * Context handed to the adapter when generating bundler config for a given MFE.
 */
export interface FrameworkAdapterContext {
  /** The MFE the adapter is wiring. */
  readonly entry: MFEManifestEntry;
  /** Dev or production build. */
  readonly mode: AdapterMode;
  /** Absolute path the MFE will resolve relative paths from. */
  readonly cwd: string;
}

/**
 * Framework adapter contract.
 *
 * The default-shared map lets an adapter declare canonical singletons for its
 * framework (e.g. React adapter contributes `react`/`react-dom`). MFKit merges
 * these with manifest-level shared deps; per-MFE entries win on key conflict.
 */
export interface FrameworkAdapter<BundlerPlugin = unknown> {
  readonly id: FrameworkId;
  /** Bundler plugins this adapter contributes for the given MFE/mode. */
  readonly plugins: (ctx: FrameworkAdapterContext) => readonly BundlerPlugin[];
  /** Default dev-server port if the manifest doesn't supply one. */
  readonly defaultPort?: number;
  /** Adapter-supplied shared deps (e.g. React adapter shares react/react-dom). */
  readonly defaultShared?: SharedDependencyMap;
  /**
   * Extra `optimizeDeps.exclude` entries this framework needs (e.g. workspace
   * packages whose exports map confuses the dev pre-bundler).
   */
  readonly optimizeDepsExclude?: readonly string[];
}
