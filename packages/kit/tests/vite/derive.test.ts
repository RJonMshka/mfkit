import { describe, expect, it } from "vitest";

import {
  MFKIT_CONFIG_VERSION,
  type FrameworkAdapter,
  type MFKitConfig,
} from "../../src/index.js";
import {
  buildRemotesMap,
  deriveMFE,
  deriveShell,
  findMFE,
} from "../../src/vite/derive.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const reactAdapter: FrameworkAdapter = {
  id: "react",
  defaultShared: {
    react: { singleton: true, requiredVersion: "^18.0.0" },
  },
  defaultPort: 5180,
  plugins: () => [],
};

const litAdapter: FrameworkAdapter = {
  id: "lit",
  plugins: () => [],
};

const baseConfig: MFKitConfig = {
  version: MFKIT_CONFIG_VERSION,
  name: "test",
  shell: { name: "shell", framework: "react", path: "apps/shell", port: 3000 },
  mfes: [
    {
      name: "mfe_a",
      framework: "react",
      path: "apps/mfe-a",
      route: "/a",
      port: 4001,
    },
  ],
};

// ─── findMFE ─────────────────────────────────────────────────────────────────

describe("findMFE", () => {
  it("returns the matching entry", () => {
    expect(findMFE(baseConfig, "mfe_a").name).toBe("mfe_a");
  });

  it("throws with known names listed when not found", () => {
    expect(() => findMFE(baseConfig, "missing")).toThrow(
      /No MFE named "missing".*"mfe_a"/s,
    );
  });
});

// ─── deriveMFE — port resolution ────────────────────────────────────────────

describe("deriveMFE port resolution", () => {
  it("uses the entry's explicit port when set", () => {
    const r = deriveMFE(baseConfig, baseConfig.mfes[0]!, reactAdapter);
    expect(r.port).toBe(4001);
    expect(r.inferred.find((f) => f.field === "port")).toBeUndefined();
  });

  it("falls back to adapter.defaultPort when entry has none", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      mfes: [{ ...baseConfig.mfes[0]!, port: undefined as never }],
    };
    delete (cfg.mfes[0] as { port?: number }).port;
    const r = deriveMFE(cfg, cfg.mfes[0]!, reactAdapter);
    expect(r.port).toBe(5180);
    expect(r.inferred[0]?.source).toBe("adapter-default");
  });

  it("auto-assigns a port from the hash range when no default exists", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      mfes: [
        { name: "mfe_lit", framework: "lit", path: "apps/lit", route: "/x" },
      ],
    };
    const r = deriveMFE(cfg, cfg.mfes[0]!, litAdapter);
    expect(r.port).toBeGreaterThanOrEqual(5173);
    expect(r.port).toBeLessThanOrEqual(5273);
    expect(r.inferred.find((f) => f.field === "port")?.source).toBe(
      "auto-assigned",
    );
  });

  it("skips the adapter default when it collides with another explicit port", () => {
    const cfg: MFKitConfig = {
      version: MFKIT_CONFIG_VERSION,
      name: "test",
      shell: { name: "shell", framework: "react", path: "apps/shell", port: 5180 },
      mfes: [
        { name: "mfe_a", framework: "react", path: "apps/a", route: "/a" },
      ],
    };
    const r = deriveMFE(cfg, cfg.mfes[0]!, reactAdapter);
    expect(r.port).not.toBe(5180);
    expect(r.inferred.find((f) => f.field === "port")?.source).toBe(
      "auto-assigned",
    );
  });
});

// ─── deriveMFE — exposes + remoteEntry defaults ─────────────────────────────

describe("deriveMFE defaults", () => {
  it("defaults exposes to { ./lifecycle: ./src/lifecycle.ts }", () => {
    const r = deriveMFE(baseConfig, baseConfig.mfes[0]!, reactAdapter);
    expect(r.exposes).toEqual({ "./lifecycle": "./src/lifecycle.ts" });
    expect(r.inferred.some((f) => f.field === "exposes")).toBe(true);
  });

  it("keeps user-supplied exposes verbatim", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      mfes: [
        {
          ...baseConfig.mfes[0]!,
          exposes: { "./custom": "./src/custom.ts" },
        },
      ],
    };
    const r = deriveMFE(cfg, cfg.mfes[0]!, reactAdapter);
    expect(r.exposes).toEqual({ "./custom": "./src/custom.ts" });
    expect(r.inferred.some((f) => f.field === "exposes")).toBe(false);
  });

  it("defaults remoteEntry to remoteEntry.js", () => {
    const r = deriveMFE(baseConfig, baseConfig.mfes[0]!, reactAdapter);
    expect(r.remoteEntryFile).toBe("remoteEntry.js");
  });
});

// ─── deriveMFE — shared composition ─────────────────────────────────────────

describe("deriveMFE shared composition", () => {
  it("composes adapter ⊕ manifest ⊕ entry, with entry winning on key conflict", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      shared: { lodash: { singleton: false } },
      mfes: [
        {
          ...baseConfig.mfes[0]!,
          shared: { react: { singleton: true, requiredVersion: "^19.0.0" } },
        },
      ],
    };
    const r = deriveMFE(cfg, cfg.mfes[0]!, reactAdapter);
    expect(r.shared).toEqual({
      react: { singleton: true, requiredVersion: "^19.0.0" }, // entry wins
      lodash: { singleton: false },
    });
  });
});

// ─── deriveShell + buildRemotesMap ──────────────────────────────────────────

describe("deriveShell and buildRemotesMap", () => {
  it("defaults shell port to 3000", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      shell: { name: "shell", framework: "react", path: "apps/shell" },
    };
    const r = deriveShell(cfg, reactAdapter, { mode: "dev" });
    expect(r.port).toBe(3000);
    expect(r.inferred.some((f) => f.field === "port")).toBe(true);
  });

  it("dev remote URLs use localhost + entry port", () => {
    const m = buildRemotesMap(baseConfig, "dev");
    expect(m["mfe_a"]).toBe("http://localhost:4001/remoteEntry.js");
  });

  it("build remote URLs use entry.origin when set", () => {
    const cfg: MFKitConfig = {
      ...baseConfig,
      mfes: [{ ...baseConfig.mfes[0]!, origin: "https://cdn.example.com" }],
    };
    const m = buildRemotesMap(cfg, "build");
    expect(m["mfe_a"]).toBe("https://cdn.example.com/remoteEntry.js");
  });

  it("build remote URLs fall back to localhost when origin missing (logged as inferred)", () => {
    const inferred: ReturnType<typeof deriveShell>["inferred"] = [];
    const m = buildRemotesMap(baseConfig, "build", inferred as never);
    expect(m["mfe_a"]).toBe("http://localhost:4001/remoteEntry.js");
    expect(inferred.some((f) => f.source === "fallback-origin")).toBe(true);
  });
});
