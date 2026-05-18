// runWithHealing — orchestrates an MFE operation against a HealingStrategy.
//
// Caller hands in a thunk (`op`) plus the MFE entry, the operation kind
// ("load" | "mount"), and the active strategy. The runner:
//   1. Skips immediately if the MFE is quarantined in the supplied registry.
//   2. Awaits `op()`. On success → return.
//   3. On rejection → consult the strategy's onLoadError/onMountError hook.
//      - retry      → wait afterMs (cancellable via signal), increment, loop.
//      - quarantine → record in registry, throw MFEQuarantinedError.
//      - fail       → throw MFEHealingError carrying the strategy's reason.
//   4. A safety net forces quarantine once the attempt counter exceeds
//      strategy.maxAttempts so a misbehaving strategy can't loop forever.

import type {
  HealingDecision,
  HealingStrategy,
  MFEManifestEntry,
} from "@mfkit/plugin-api";

import type { QuarantineRegistry } from "./quarantine.js";

export type HealingOpKind = "load" | "mount";

export interface RunWithHealingOptions<T> {
  readonly op: () => Promise<T>;
  readonly entry: MFEManifestEntry;
  readonly kind: HealingOpKind;
  readonly strategy: HealingStrategy;
  readonly registry?: QuarantineRegistry;
  readonly signal?: AbortSignal;
  /** Fires before each retry wait so UI can surface a countdown. */
  readonly onRetry?: (
    decision: Extract<HealingDecision, { action: "retry" }>,
    error: Error,
  ) => void;
}

export class MFEHealingError extends Error {
  override readonly name = "MFEHealingError";
  readonly entryName: string;
  override readonly cause: Error;
  constructor(entryName: string, message: string, cause: Error) {
    super(message);
    this.entryName = entryName;
    this.cause = cause;
  }
}

export class MFEQuarantinedError extends Error {
  override readonly name = "MFEQuarantinedError";
  readonly entryName: string;
  override readonly cause?: Error;
  constructor(entryName: string, reason: string, cause?: Error) {
    super(`MFE "${entryName}" quarantined: ${reason}`);
    this.entryName = entryName;
    if (cause) this.cause = cause;
  }
}

export async function runWithHealing<T>(
  opts: RunWithHealingOptions<T>,
): Promise<T> {
  const { op, entry, kind, strategy, registry, signal, onRetry } = opts;

  if (registry?.isQuarantined(entry.name)) {
    const reason =
      registry.snapshot().get(entry.name)?.reason ?? "already quarantined";
    throw new MFEQuarantinedError(entry.name, reason);
  }

  const handler =
    kind === "load" ? strategy.onLoadError : strategy.onMountError;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError(signal);

    let lastError: Error;
    try {
      return await op();
    } catch (raw) {
      lastError = raw instanceof Error ? raw : new Error(String(raw));
    }

    const decision = handler({ entry, attempt, error: lastError });

    if (decision.action === "fail") {
      throw new MFEHealingError(entry.name, decision.reason, lastError);
    }
    if (decision.action === "quarantine") {
      registry?.quarantine(entry.name, lastError.message);
      throw new MFEQuarantinedError(entry.name, lastError.message, lastError);
    }

    if (attempt >= strategy.maxAttempts) {
      registry?.quarantine(entry.name, lastError.message);
      throw new MFEQuarantinedError(entry.name, lastError.message, lastError);
    }

    onRetry?.(decision, lastError);
    await wait(Math.max(0, decision.afterMs), signal);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}
