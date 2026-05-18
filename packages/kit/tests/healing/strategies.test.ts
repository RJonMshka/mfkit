import { describe, expect, it } from "vitest";

import type {
  HealingContext,
  MFEManifestEntry,
  VersionMismatchContext,
} from "../../src/index.js";
import {
  forgivingStrategy,
  strictStrategy,
} from "../../src/healing/strategies.js";

const entry: MFEManifestEntry = {
  name: "mfe_metrics",
  framework: "svelte",
  path: "apps/mfe-metrics",
  route: "/metrics",
};

const error = new Error("boom");

function loadCtx(attempt: number): HealingContext {
  return { entry, attempt, error };
}

const mismatch: VersionMismatchContext = {
  name: "react",
  expected: "^18.0.0",
  actual: "17.0.2",
  entry,
};

describe("forgivingStrategy", () => {
  it("defaults to id, maxAttempts=3, exponential backoff 200/400, warn", () => {
    const s = forgivingStrategy();
    expect(s.id).toBe("mfkit-forgiving");
    expect(s.maxAttempts).toBe(3);

    expect(s.onLoadError(loadCtx(1))).toEqual({ action: "retry", afterMs: 200 });
    expect(s.onLoadError(loadCtx(2))).toEqual({ action: "retry", afterMs: 400 });
    expect(s.onLoadError(loadCtx(3))).toEqual({ action: "quarantine" });

    expect(s.onMountError(loadCtx(1))).toEqual({ action: "retry", afterMs: 200 });
    expect(s.onVersionMismatch(mismatch)).toBe("warn");
  });

  it("clamps retry delay to maxDelayMs", () => {
    const s = forgivingStrategy({
      maxAttempts: 10,
      initialDelayMs: 1_000,
      maxDelayMs: 2_500,
    });
    expect(s.onLoadError(loadCtx(1))).toEqual({ action: "retry", afterMs: 1_000 });
    expect(s.onLoadError(loadCtx(2))).toEqual({ action: "retry", afterMs: 2_000 });
    expect(s.onLoadError(loadCtx(3))).toEqual({ action: "retry", afterMs: 2_500 });
    expect(s.onLoadError(loadCtx(4))).toEqual({ action: "retry", afterMs: 2_500 });
  });

  it("respects user-supplied maxAttempts, id, and verdict override", () => {
    const s = forgivingStrategy({
      maxAttempts: 1,
      id: "custom",
      onVersionMismatch: "ignore",
    });
    expect(s.id).toBe("custom");
    expect(s.maxAttempts).toBe(1);
    expect(s.onLoadError(loadCtx(1))).toEqual({ action: "quarantine" });
    expect(s.onVersionMismatch(mismatch)).toBe("ignore");
  });
});

describe("strictStrategy", () => {
  it("fails fast on load and mount, throws on version mismatch", () => {
    const s = strictStrategy();
    expect(s.id).toBe("mfkit-strict");
    expect(s.maxAttempts).toBe(1);

    const load = s.onLoadError(loadCtx(1));
    expect(load.action).toBe("fail");
    if (load.action === "fail") {
      expect(load.reason).toContain("mfe_metrics");
      expect(load.reason).toContain("failed to load");
      expect(load.reason).toContain("boom");
    }

    const mount = s.onMountError(loadCtx(1));
    expect(mount.action).toBe("fail");
    if (mount.action === "fail") {
      expect(mount.reason).toContain("failed to mount");
    }

    expect(s.onVersionMismatch(mismatch)).toBe("throw");
  });

  it("accepts a verdict override (e.g. warn instead of throw)", () => {
    const s = strictStrategy({ onVersionMismatch: "warn" });
    expect(s.onVersionMismatch(mismatch)).toBe("warn");
  });
});
