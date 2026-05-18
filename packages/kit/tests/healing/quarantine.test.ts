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
