/**
 * Healing strategy contract — the rulebook for "what does MFKit do when an
 * MFE misbehaves at runtime?"
 *
 * Failure modes covered:
 *   - Remote fetch failure (network, 404, CORS).
 *   - Mount throwing or rejecting.
 *   - Singleton version mismatch between shell and MFE at runtime.
 *
 * The default strategy is forgiving: retry with backoff, quarantine after N
 * failures, warn on version mismatch. Enterprise consumers can swap in a
 * stricter strategy that fails fast and throws on version skew.
 */

import type { MFEManifestEntry } from "./manifest.js";

/**
 * Decision returned from a healing hook.
 *
 *   - `retry`  — try again after `afterMs`. Counter increments.
 *   - `quarantine` — stop trying this MFE; the rest of the app keeps running.
 *   - `fail` — surface the error to the user via the outlet's error UI.
 */
export type HealingDecision =
  | { readonly action: "retry"; readonly afterMs: number }
  | { readonly action: "quarantine" }
  | { readonly action: "fail"; readonly reason: string };

/** Severity the strategy assigns to a singleton version mismatch. */
export type VersionMismatchVerdict = "warn" | "throw" | "ignore";

export interface HealingContext {
  readonly entry: MFEManifestEntry;
  /** 1-indexed attempt counter — first attempt is `1`, retries grow from there. */
  readonly attempt: number;
  /** The error MFKit caught from the failing operation. */
  readonly error: Error;
}

export interface VersionMismatchContext {
  /** Singleton package name (e.g. `"react"`). */
  readonly name: string;
  /** Version declared by the shell's manifest. */
  readonly expected: string;
  /** Version the MFE actually loaded. */
  readonly actual: string;
  /** The MFE that surfaced the mismatch. */
  readonly entry: MFEManifestEntry;
}

export interface HealingStrategy {
  readonly id: string;
  /** Called when fetching the remote container fails. */
  readonly onLoadError: (ctx: HealingContext) => HealingDecision;
  /** Called when `mount` throws or rejects. */
  readonly onMountError: (ctx: HealingContext) => HealingDecision;
  /** Called once per detected singleton version mismatch. */
  readonly onVersionMismatch: (ctx: VersionMismatchContext) => VersionMismatchVerdict;
  /** Upper bound on retries before forcing quarantine. */
  readonly maxAttempts: number;
}
