/**
 * Discovery strategy contract.
 *
 * Discovery is how MFKit finds the canonical list of MFEs at a given moment.
 * The default strategy reads `mfkit.config.ts`. Alternative strategies can
 * augment or replace it: glob the `apps/*` directory, query an npm registry
 * for `mfkit-template`-tagged packages, fetch from a federation graph API.
 *
 * Multiple strategies may compose — each contributes entries; MFKit dedupes
 * by `name` with last-wins precedence (manifest first, then plugins in order).
 */

import type { MFEManifestEntry, MFKitConfig } from "./manifest.js";

export interface DiscoveryContext {
  /** Absolute path of the consumer's workspace root. */
  readonly cwd: string;
  /** The static manifest. Strategies may augment but should not mutate. */
  readonly config: MFKitConfig;
}

export interface DiscoveryStrategy {
  /** Stable identifier — used in logs, plugin ordering, dedup. */
  readonly id: string;
  /** Returns the MFE entries this strategy contributes for the given context. */
  readonly discover: (ctx: DiscoveryContext) => Promise<readonly MFEManifestEntry[]>;
}
