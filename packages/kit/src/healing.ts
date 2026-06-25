// @mfkit/kit/healing — runtime self-healing primitives.
//
// All behavior routes through the HealingStrategy contract in
// @mfkit/plugin-api so enterprises can swap forgiving defaults for a
// stricter strategy without touching the runner, outlet, or version check.
//
// Surface:
//   - forgivingStrategy / strictStrategy   default strategy factories
//   - resolveHealingStrategy(config)       config.healing ?? forgivingStrategy()
//   - createQuarantineRegistry             shared "give-up" state per MFE
//   - runWithHealing                       orchestrator used by the outlet
//   - checkSingletonVersion                version-skew gate
//   - createManifestCache                  last-known-good fallback

import type { HealingStrategy, MFKitConfig } from "@mfkit/plugin-api";

import { forgivingStrategy } from "./healing/strategies.js";

export {
  createManifestCache,
  type ManifestCache,
  type ManifestCacheOptions,
  type ManifestLoadResult,
  type ManifestStorage,
  memoryManifestStorage,
} from "./healing/manifest-cache.js";

export {
  createQuarantineRegistry,
  type QuarantineRecord,
  type QuarantineRegistry,
} from "./healing/quarantine.js";

export {
  type HealingOpKind,
  MFEHealingError,
  MFEQuarantinedError,
  type RunWithHealingOptions,
  runWithHealing,
} from "./healing/runner.js";
export {
  type ForgivingStrategyOptions,
  forgivingStrategy,
  type StrictStrategyOptions,
  strictStrategy,
} from "./healing/strategies.js";
export {
  checkSingletonVersion,
  SingletonVersionError,
} from "./healing/version.js";

/** Resolve the strategy a consumer's MFKitConfig declares, or the default. */
export function resolveHealingStrategy(config: MFKitConfig): HealingStrategy {
  return config.healing ?? forgivingStrategy();
}
