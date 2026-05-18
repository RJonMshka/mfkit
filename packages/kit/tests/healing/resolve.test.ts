import { describe, expect, it } from "vitest";

import {
  MFKIT_CONFIG_VERSION,
  type HealingStrategy,
  type MFKitConfig,
} from "../../src/index.js";
import { resolveHealingStrategy } from "../../src/healing.js";

const baseConfig: MFKitConfig = {
  version: MFKIT_CONFIG_VERSION,
  name: "t",
  shell: { name: "shell", framework: "react", path: "apps/shell" },
  mfes: [],
};

describe("resolveHealingStrategy", () => {
  it("returns the forgiving default when config.healing is absent", () => {
    const s = resolveHealingStrategy(baseConfig);
    expect(s.id).toBe("mfkit-forgiving");
    expect(s.maxAttempts).toBe(3);
  });

  it("returns the configured strategy unchanged when present", () => {
    const custom: HealingStrategy = {
      id: "custom",
      maxAttempts: 7,
      onLoadError: () => ({ action: "quarantine" }),
      onMountError: () => ({ action: "quarantine" }),
      onVersionMismatch: () => "ignore",
    };
    expect(resolveHealingStrategy({ ...baseConfig, healing: custom })).toBe(
      custom,
    );
  });
});
