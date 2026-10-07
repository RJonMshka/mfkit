// Quarantine registry — shared across outlets so a single decision to give
// up on an MFE persists across re-renders. The runner reads `isQuarantined`
// before its first attempt and writes via `quarantine` when a strategy
// returns `{ action: "quarantine" }`.
//
// Optional cooldown makes it a circuit breaker (review O5). Without one, a
// quarantine lasts until reload — one bad deploy window and the MFE stays dark
// for the life of the tab even after its remote recovers. With `cooldownMs`:
//
//   open       quarantined; outlets render the quarantined slot
//   half-open  cooldown elapsed; the next attempt is a single probe
//   closed     probe succeeded → record cleared
//
// A failed probe re-quarantines immediately (no retry storm against a remote
// that is still down) and restarts the cooldown.

export interface QuarantineRecord {
  readonly reason: string;
  readonly quarantinedAt: number;
  /** When the record goes half-open. Absent when the registry has no cooldown. */
  readonly retryAt?: number;
}

export interface QuarantineRegistry {
  /** True while the record is open (quarantined and not yet due for a probe). */
  isQuarantined(name: string): boolean;
  quarantine(name: string, reason: string): void;
  /** Lift quarantine for `name`, or all entries when called without arguments. */
  clear(name?: string): void;
  snapshot(): ReadonlyMap<string, QuarantineRecord>;
  /**
   * True when the cooldown has elapsed and the next attempt should be a single
   * probe. Optional so custom registries written before cooldowns still fit.
   */
  isHalfOpen?(name: string): boolean;
}

export interface QuarantineRegistryOptions {
  /**
   * Time after which a quarantined MFE gets one probe attempt. Omit for the
   * classic behavior: quarantined until `clear()` or reload.
   */
  readonly cooldownMs?: number;
  /** Clock override for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export function createQuarantineRegistry(opts: QuarantineRegistryOptions = {}): QuarantineRegistry {
  const records = new Map<string, QuarantineRecord>();
  const now = opts.now ?? Date.now;
  const cooldown = opts.cooldownMs;
  if (cooldown !== undefined && !(Number.isFinite(cooldown) && cooldown >= 0)) {
    throw new RangeError(
      `createQuarantineRegistry: cooldownMs must be a finite number >= 0 (got ${cooldown})`,
    );
  }

  const due = (r: QuarantineRecord): boolean => r.retryAt !== undefined && now() >= r.retryAt;

  return {
    isQuarantined: (name) => {
      const r = records.get(name);
      return r !== undefined && !due(r);
    },
    isHalfOpen: (name) => {
      const r = records.get(name);
      return r !== undefined && due(r);
    },
    quarantine: (name, reason) => {
      const at = now();
      records.set(name, {
        reason,
        quarantinedAt: at,
        ...(cooldown !== undefined ? { retryAt: at + cooldown } : {}),
      });
    },
    clear: (name) => {
      if (name === undefined) records.clear();
      else records.delete(name);
    },
    snapshot: () => new Map(records),
  };
}
