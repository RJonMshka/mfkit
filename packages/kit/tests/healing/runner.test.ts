import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuarantineRegistry } from "../../src/healing/quarantine.js";
import { MFEHealingError, MFEQuarantinedError, runWithHealing } from "../../src/healing/runner.js";
import { forgivingStrategy, strictStrategy } from "../../src/healing/strategies.js";
import type { HealingStrategy, MFEManifestEntry } from "../../src/index.js";

const entry: MFEManifestEntry = {
  name: "mfe_metrics",
  framework: "svelte",
  path: "apps/mfe-metrics",
  route: "/metrics",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runWithHealing — happy path", () => {
  it("returns the op's value on first success without consulting the strategy", async () => {
    const onLoadError = vi.fn();
    const strategy: HealingStrategy = {
      ...forgivingStrategy(),
      onLoadError,
    };
    const op = vi.fn(async () => 42);

    const result = await runWithHealing({
      op,
      entry,
      kind: "load",
      strategy,
    });

    expect(result).toBe(42);
    expect(op).toHaveBeenCalledTimes(1);
    expect(onLoadError).not.toHaveBeenCalled();
  });
});

describe("runWithHealing — retry path", () => {
  it("retries with the strategy's delay then resolves", async () => {
    const op = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce("ok");

    const onRetry = vi.fn();
    const promise = runWithHealing({
      op,
      entry,
      kind: "load",
      strategy: forgivingStrategy({ initialDelayMs: 100 }),
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toEqual({
      action: "retry",
      afterMs: 100,
    });
  });

  it("quarantines after maxAttempts and records the reason in the registry", async () => {
    const registry = createQuarantineRegistry();
    const op = vi.fn().mockRejectedValue(new Error("net down"));

    const promise = runWithHealing({
      op,
      entry,
      kind: "load",
      strategy: forgivingStrategy({ maxAttempts: 2, initialDelayMs: 10 }),
      registry,
    });

    // Two attempts: initial + one retry after 10ms wait.
    const expectation = expect(promise).rejects.toBeInstanceOf(MFEQuarantinedError);
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    expect(op).toHaveBeenCalledTimes(2);
    expect(registry.isQuarantined(entry.name)).toBe(true);
    expect(registry.snapshot().get(entry.name)?.reason).toBe("net down");
  });

  it("uses onMountError when kind is 'mount'", async () => {
    const onMountError = vi.fn(() => ({ action: "quarantine" }) as const);
    const onLoadError = vi.fn();
    const strategy: HealingStrategy = {
      ...forgivingStrategy(),
      onLoadError,
      onMountError,
    };

    await expect(
      runWithHealing({
        op: () => Promise.reject(new Error("mount fail")),
        entry,
        kind: "mount",
        strategy,
      }),
    ).rejects.toBeInstanceOf(MFEQuarantinedError);

    expect(onMountError).toHaveBeenCalledTimes(1);
    expect(onLoadError).not.toHaveBeenCalled();
  });
});

describe("runWithHealing — fail and pre-quarantine", () => {
  it("throws MFEHealingError when strategy returns { action: 'fail' }", async () => {
    await expect(
      runWithHealing({
        op: () => Promise.reject(new Error("nope")),
        entry,
        kind: "load",
        strategy: strictStrategy(),
      }),
    ).rejects.toMatchObject({
      name: "MFEHealingError",
      entryName: entry.name,
    });
  });

  it("short-circuits when the MFE is already quarantined", async () => {
    const registry = createQuarantineRegistry();
    registry.quarantine(entry.name, "earlier failure");
    const op = vi.fn();

    await expect(
      runWithHealing({
        op,
        entry,
        kind: "load",
        strategy: forgivingStrategy(),
        registry,
      }),
    ).rejects.toMatchObject({
      name: "MFEQuarantinedError",
      entryName: entry.name,
      message: expect.stringContaining("earlier failure"),
    });
    expect(op).not.toHaveBeenCalled();
  });

  it("safety-net quarantines if strategy keeps requesting retry past maxAttempts", async () => {
    const buggyStrategy: HealingStrategy = {
      id: "buggy",
      maxAttempts: 2,
      onLoadError: () => ({ action: "retry", afterMs: 1 }),
      onMountError: () => ({ action: "retry", afterMs: 1 }),
      onVersionMismatch: () => "ignore",
    };
    const op = vi.fn().mockRejectedValue(new Error("always fails"));

    const promise = runWithHealing({
      op,
      entry,
      kind: "load",
      strategy: buggyStrategy,
    });
    const expectation = expect(promise).rejects.toBeInstanceOf(MFEQuarantinedError);
    await vi.advanceTimersByTimeAsync(5);
    await expectation;
    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe("runWithHealing — abort", () => {
  it("rejects with AbortError when the signal aborts mid-wait", async () => {
    const controller = new AbortController();
    const op = vi.fn().mockRejectedValueOnce(new Error("net"));

    const promise = runWithHealing({
      op,
      entry,
      kind: "load",
      strategy: forgivingStrategy({ initialDelayMs: 1_000 }),
      signal: controller.signal,
    });

    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("throws immediately if signal is already aborted before first attempt", async () => {
    const controller = new AbortController();
    controller.abort();
    const op = vi.fn();

    await expect(
      runWithHealing({
        op,
        entry,
        kind: "load",
        strategy: forgivingStrategy(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(op).not.toHaveBeenCalled();
  });
});

describe("runWithHealing — error wrapping", () => {
  it("wraps non-Error rejections into Error before invoking the strategy", async () => {
    const seen: unknown[] = [];
    const strategy: HealingStrategy = {
      id: "capture",
      maxAttempts: 1,
      onLoadError: (ctx) => {
        seen.push(ctx.error);
        return { action: "fail", reason: ctx.error.message };
      },
      onMountError: () => ({ action: "fail", reason: "n/a" }),
      onVersionMismatch: () => "ignore",
    };

    await expect(
      runWithHealing({
        // eslint-disable-next-line prefer-promise-reject-errors
        op: () => Promise.reject("plain string"),
        entry,
        kind: "load",
        strategy,
      }),
    ).rejects.toBeInstanceOf(MFEHealingError);
    expect(seen[0]).toBeInstanceOf(Error);
    expect((seen[0] as Error).message).toBe("plain string");
  });
});
