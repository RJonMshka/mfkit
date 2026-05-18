import { describe, it, expect } from "vitest";
import {
  defineConfig,
  defineMFE,
  MFKIT_CONFIG_VERSION,
  MFKitConfigError,
} from "../src/index.js";
import type {
  HealingStrategy,
  MFEContext,
  MFEDefinition,
  MFEManifestEntry,
  MFKitConfig,
} from "../src/index.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const validEntry: MFEManifestEntry = {
  name: "mfe_metrics",
  framework: "svelte",
  path: "apps/mfe-metrics",
  route: "/metrics",
  port: 3002,
};

const validConfig: MFKitConfig = {
  version: MFKIT_CONFIG_VERSION,
  name: "devnexus-test",
  shell: {
    name: "shell",
    framework: "react",
    path: "apps/shell",
    port: 3000,
  },
  mfes: [validEntry],
};

const fullHealing: HealingStrategy = {
  id: "test-default",
  onLoadError: () => ({ action: "retry", afterMs: 250 }),
  onMountError: () => ({ action: "retry", afterMs: 250 }),
  onVersionMismatch: () => "warn",
  maxAttempts: 3,
};

// ─── defineConfig ───────────────────────────────────────────────────────────

describe("defineConfig", () => {
  it("returns a minimally valid config unchanged (reference-equal)", () => {
    expect(defineConfig(validConfig)).toBe(validConfig);
  });

  it("accepts a fully featured config", () => {
    const config: MFKitConfig = {
      version: MFKIT_CONFIG_VERSION,
      name: validConfig.name,
      shell: validConfig.shell,
      budgets: { shellInitial: 180_000, sharedScope: 60_000, perMfe: 150_000 },
      healing: fullHealing,
      mfes: [
        {
          ...validEntry,
          remoteEntry: "remoteEntry.js",
          origin: "http://localhost:3002",
          exposes: { "./lifecycle": "./src/lifecycle.ts" },
          shared: {
            "@devnexus/shared": {
              requiredVersion: "*",
              singleton: true,
              strictVersion: true,
            },
          },
          label: "Metrics",
          description: "real-time metrics",
          budgetBytes: 150_000,
        },
      ],
    };
    expect(defineConfig(config)).toBe(config);
  });

  it("throws when version is missing", () => {
    const { version: _v, ...bad } = validConfig;
    void _v;
    expect(() => defineConfig(bad as MFKitConfig)).toThrow(MFKitConfigError);
  });

  it("throws when version is wrong", () => {
    const bad = {
      ...validConfig,
      version: 999 as unknown as typeof MFKIT_CONFIG_VERSION,
    };
    expect(() => defineConfig(bad)).toThrowError(/version must equal 1/);
  });

  it("throws when shell is missing", () => {
    const { shell: _s, ...bad } = validConfig;
    void _s;
    expect(() => defineConfig(bad as MFKitConfig)).toThrow(MFKitConfigError);
  });

  it("throws when port is out of range", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [{ ...validEntry, port: 80 }],
    };
    expect(() => defineConfig(bad)).toThrowError(/port must be >= 1024/);
  });

  it("throws when route doesn't start with /", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [{ ...validEntry, route: "metrics" }],
    };
    expect(() => defineConfig(bad)).toThrowError(/route must start with '\/'/);
  });

  it("throws when MFE name is not a valid JS identifier", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [{ ...validEntry, name: "mfe-metrics" }],
    };
    expect(() => defineConfig(bad)).toThrowError(/valid JS identifier/);
  });

  it("throws on duplicate MFE names", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [validEntry, { ...validEntry, port: 3003, route: "/m2" }],
    };
    expect(() => defineConfig(bad)).toThrowError(
      /Duplicate MFE name: "mfe_metrics"/,
    );
  });

  it("throws on duplicate ports across MFEs", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [
        validEntry,
        { ...validEntry, name: "mfe_other", route: "/other" }, // same port 3002
      ],
    };
    expect(() => defineConfig(bad)).toThrowError(/Port 3002 used by both/);
  });

  it("throws on duplicate routes across MFEs", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [
        validEntry,
        { ...validEntry, name: "mfe_other", port: 3003 }, // same route /metrics
      ],
    };
    expect(() => defineConfig(bad)).toThrowError(/Route "\/metrics" used by both/);
  });

  it("aggregates multiple schema issues into one error message", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [{ ...validEntry, port: 80, route: "no-slash" }],
    };
    try {
      defineConfig(bad);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MFKitConfigError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/port must be >= 1024/);
      expect(msg).toMatch(/route must start with '\/'/);
    }
  });

  it("exposes structured issues on the error", () => {
    const bad: MFKitConfig = {
      ...validConfig,
      mfes: [{ ...validEntry, port: 80 }],
    };
    try {
      defineConfig(bad);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MFKitConfigError);
      const err = e as MFKitConfigError;
      expect(err.issues.length).toBeGreaterThan(0);
      expect(err.issues[0]?.path).toContain("port");
    }
  });
});

// ─── defineMFE ──────────────────────────────────────────────────────────────

describe("defineMFE", () => {
  const noopCtx: MFEContext = {
    basePath: "/test",
    mountId: "test-1",
    signal: new AbortController().signal,
  };

  it("returns a valid lifecycle unchanged (reference-equal)", () => {
    const lifecycle: MFEDefinition = {
      async mount(_el: HTMLElement, _ctx: MFEContext) {},
      async unmount(_el: HTMLElement) {},
    };
    expect(defineMFE(lifecycle)).toBe(lifecycle);
  });

  it("accepts typed Props", () => {
    type P = { user: string };
    const lifecycle: MFEDefinition<P> = {
      mount(_el, ctx, props) {
        void ctx;
        void props;
      },
      unmount() {},
    };
    expect(defineMFE(lifecycle).mount).toBe(lifecycle.mount);
    expect(noopCtx.signal.aborted).toBe(false);
  });

  it("throws when mount is missing", () => {
    const bad = { unmount: async () => {} };
    expect(() => defineMFE(bad as never)).toThrowError(/mount must be a function/);
  });

  it("throws when unmount is missing", () => {
    const bad = { mount: async () => {} };
    expect(() => defineMFE(bad as never)).toThrowError(/unmount must be a function/);
  });

  it("throws when mount is not a function", () => {
    const bad = { mount: "nope", unmount: async () => {} };
    expect(() => defineMFE(bad as never)).toThrowError(MFKitConfigError);
  });

  it("throws when lifecycle is null", () => {
    expect(() => defineMFE(null as never)).toThrowError(MFKitConfigError);
  });
});
