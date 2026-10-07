/**
 * Discovery strategy contract.
 *
 * Discovery is how MFKit finds the canonical list of MFEs at a given moment.
 * The default strategy reads `mfkit.config.ts`. Alternative strategies can
 * augment or replace it: glob the `apps/*` directory, query an npm registry
 * for `mfkit-template`-tagged packages, fetch from a federation graph API.
 *
 * Multiple strategies compose: `config.discovery` runs first, then each
 * plugin's in order. Discovered entries are *added* to the manifest; an entry
 * whose `name` the manifest already declares is ignored (user-declared values
 * always win). Among discovered entries, a later strategy wins a name tie.
 * The merged list is validated like a hand-written manifest. Run by
 * `resolveConfig` (`@mfkit/kit`) at build time, so strategies may use the
 * filesystem.
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
