// Quarantine registry — shared across outlets so a single decision to give
// up on an MFE persists across re-renders. The runner reads `isQuarantined`
// before its first attempt and writes via `quarantine` when a strategy
// returns `{ action: "quarantine" }`.

export interface QuarantineRecord {
  readonly reason: string;
  readonly quarantinedAt: number;
}

export interface QuarantineRegistry {
  isQuarantined(name: string): boolean;
  quarantine(name: string, reason: string): void;
  /** Lift quarantine for `name`, or all entries when called without arguments. */
  clear(name?: string): void;
  snapshot(): ReadonlyMap<string, QuarantineRecord>;
}

export function createQuarantineRegistry(): QuarantineRegistry {
  const records = new Map<string, QuarantineRecord>();
  return {
    isQuarantined: (name) => records.has(name),
    quarantine: (name, reason) => {
      records.set(name, { reason, quarantinedAt: Date.now() });
    },
    clear: (name) => {
      if (name === undefined) records.clear();
      else records.delete(name);
    },
    snapshot: () => new Map(records),
  };
}
