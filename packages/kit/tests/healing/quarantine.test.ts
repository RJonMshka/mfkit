import { describe, expect, it } from "vitest";

import { createQuarantineRegistry } from "../../src/healing/quarantine.js";

describe("createQuarantineRegistry", () => {
  it("starts empty and reports quarantine status per name", () => {
    const r = createQuarantineRegistry();
    expect(r.isQuarantined("mfe_a")).toBe(false);
    r.quarantine("mfe_a", "load failed");
    expect(r.isQuarantined("mfe_a")).toBe(true);
    expect(r.isQuarantined("mfe_b")).toBe(false);
  });

  it("snapshot returns an independent map carrying reason and timestamp", () => {
    const r = createQuarantineRegistry();
    const before = Date.now();
    r.quarantine("mfe_a", "load failed");
    const snap = r.snapshot();
    const record = snap.get("mfe_a");
    expect(record?.reason).toBe("load failed");
    expect(record?.quarantinedAt).toBeGreaterThanOrEqual(before);

    // Mutations to the registry after snapshotting must not leak in.
    r.quarantine("mfe_b", "later");
    expect(snap.has("mfe_b")).toBe(false);
  });

  it("clear(name) lifts one entry; clear() with no args clears all", () => {
    const r = createQuarantineRegistry();
    r.quarantine("mfe_a", "boom");
    r.quarantine("mfe_b", "boom");
    r.clear("mfe_a");
    expect(r.isQuarantined("mfe_a")).toBe(false);
    expect(r.isQuarantined("mfe_b")).toBe(true);
    r.clear();
    expect(r.isQuarantined("mfe_b")).toBe(false);
  });
});

describe("createQuarantineRegistry — cooldown (review O5)", () => {
  it("is permanent without a cooldown", () => {
    let t = 0;
    const r = createQuarantineRegistry({ now: () => t });
    r.quarantine("mfe_a", "down");
    t = 1e12;
    expect(r.isQuarantined("mfe_a")).toBe(true);
    expect(r.isHalfOpen?.("mfe_a")).toBe(false);
    expect(r.snapshot().get("mfe_a")?.retryAt).toBeUndefined();
  });

  it("goes half-open once the cooldown elapses, and re-quarantine restarts it", () => {
    let t = 1_000;
    const r = createQuarantineRegistry({ cooldownMs: 500, now: () => t });
    r.quarantine("mfe_a", "down");
    expect(r.snapshot().get("mfe_a")?.retryAt).toBe(1_500);
    t = 1_499;
    expect([r.isQuarantined("mfe_a"), r.isHalfOpen?.("mfe_a")]).toEqual([true, false]);
    t = 1_500;
    expect([r.isQuarantined("mfe_a"), r.isHalfOpen?.("mfe_a")]).toEqual([false, true]);
    r.quarantine("mfe_a", "still down");
    expect([r.isQuarantined("mfe_a"), r.isHalfOpen?.("mfe_a")]).toEqual([true, false]);
    expect(r.snapshot().get("mfe_a")?.retryAt).toBe(2_000);
  });

  it("rejects a nonsensical cooldown", () => {
    expect(() => createQuarantineRegistry({ cooldownMs: -1 })).toThrow(RangeError);
    expect(() => createQuarantineRegistry({ cooldownMs: Number.NaN })).toThrow(RangeError);
  });
});
