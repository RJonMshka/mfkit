import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  HealingStrategy,
  MFEManifestEntry,
  VersionMismatchContext,
  VersionMismatchVerdict,
} from "../../src/index.js";
import {
  SingletonVersionError,
  checkSingletonVersion,
} from "../../src/healing/version.js";

const entry: MFEManifestEntry = {
  name: "mfe_metrics",
  framework: "svelte",
  path: "apps/mfe-metrics",
  route: "/metrics",
};

const ctx: VersionMismatchContext = {
  name: "react",
  expected: "^18.0.0",
  actual: "17.0.2",
  entry,
};

function strategyWith(verdict: VersionMismatchVerdict): HealingStrategy {
  return {
    id: "test",
    maxAttempts: 1,
    onLoadError: () => ({ action: "fail", reason: "" }),
    onMountError: () => ({ action: "fail", reason: "" }),
    onVersionMismatch: () => verdict,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("checkSingletonVersion", () => {
  it('throws SingletonVersionError when verdict is "throw"', () => {
    expect(() => checkSingletonVersion(strategyWith("throw"), ctx)).toThrow(
      SingletonVersionError,
    );
    try {
      checkSingletonVersion(strategyWith("throw"), ctx);
    } catch (e) {
      expect(e).toBeInstanceOf(SingletonVersionError);
      const err = e as SingletonVersionError;
      expect(err.pkg).toBe("react");
      expect(err.expected).toBe("^18.0.0");
      expect(err.actual).toBe("17.0.2");
      expect(err.entryName).toBe(entry.name);
      expect(err.message).toContain("mfe_metrics");
      expect(err.message).toContain("17.0.2");
    }
  });

  it('warns and returns the verdict when "warn"', () => {
    expect(checkSingletonVersion(strategyWith("warn"), ctx)).toBe("warn");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[mfkit]");
    expect(warnSpy.mock.calls[0]?.[0]).toContain("react");
  });

  it('is silent and returns the verdict when "ignore"', () => {
    expect(checkSingletonVersion(strategyWith("ignore"), ctx)).toBe("ignore");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
