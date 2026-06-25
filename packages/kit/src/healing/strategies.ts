// Default HealingStrategy factories.
//
// Forgiving = retry+backoff, then quarantine; warn on singleton skew. The
// shipped default. Strict = fail fast, throw on skew. For lockdown modes.
// Both return values conforming to @mfkit/plugin-api's HealingStrategy.

import type {
  HealingContext,
  HealingDecision,
  HealingStrategy,
  VersionMismatchVerdict,
} from "@mfkit/plugin-api";

const FORGIVING_DEFAULTS = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 5_000,
  versionMismatch: "warn" as VersionMismatchVerdict,
  id: "mfkit-forgiving",
} as const;

const STRICT_DEFAULTS = {
  id: "mfkit-strict",
  versionMismatch: "throw" as VersionMismatchVerdict,
} as const;

export interface ForgivingStrategyOptions {
  /** Total attempts including the first. Defaults to 3. */
  readonly maxAttempts?: number;
  /** Delay before the second attempt in ms. Doubles each retry. Defaults to 200. */
  readonly initialDelayMs?: number;
  /** Upper bound on any single retry delay in ms. Defaults to 5000. */
  readonly maxDelayMs?: number;
  /** Verdict for singleton version skew. Defaults to "warn". */
  readonly onVersionMismatch?: VersionMismatchVerdict;
  /** Strategy id surfaced in logs and telemetry. */
  readonly id?: string;
}

export function forgivingStrategy(opts: ForgivingStrategyOptions = {}): HealingStrategy {
  const maxAttempts = opts.maxAttempts ?? FORGIVING_DEFAULTS.maxAttempts;
  const initialDelayMs = opts.initialDelayMs ?? FORGIVING_DEFAULTS.initialDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? FORGIVING_DEFAULTS.maxDelayMs;
  const verdict = opts.onVersionMismatch ?? FORGIVING_DEFAULTS.versionMismatch;
  const id = opts.id ?? FORGIVING_DEFAULTS.id;

  const decide = (ctx: HealingContext): HealingDecision => {
    if (ctx.attempt >= maxAttempts) return { action: "quarantine" };
    const delay = Math.min(initialDelayMs * 2 ** (ctx.attempt - 1), maxDelayMs);
    return { action: "retry", afterMs: delay };
  };

  return {
    id,
    maxAttempts,
    onLoadError: decide,
    onMountError: decide,
    onVersionMismatch: () => verdict,
  };
}

export interface StrictStrategyOptions {
  readonly id?: string;
  readonly onVersionMismatch?: VersionMismatchVerdict;
}

export function strictStrategy(opts: StrictStrategyOptions = {}): HealingStrategy {
  const id = opts.id ?? STRICT_DEFAULTS.id;
  const verdict = opts.onVersionMismatch ?? STRICT_DEFAULTS.versionMismatch;
  return {
    id,
    maxAttempts: 1,
    onLoadError: (ctx) => ({
      action: "fail",
      reason: `MFE "${ctx.entry.name}" failed to load: ${ctx.error.message}`,
    }),
    onMountError: (ctx) => ({
      action: "fail",
      reason: `MFE "${ctx.entry.name}" failed to mount: ${ctx.error.message}`,
    }),
    onVersionMismatch: () => verdict,
  };
}
