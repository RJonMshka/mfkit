// Property tests for port resolution (testing plan L1). These invariants are
// universally quantified — "for any manifest" — so examples alone can't pin
// them. The MFE/shell agreement property is exactly the R1 bug class.

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHELL_PORT,
  defineConfig,
  type FrameworkAdapter,
  type MFEManifestEntry,
  MFKIT_CONFIG_VERSION,
  type MFKitConfig,
  MFKitConfigError,
} from "../../src/index.js";
import { buildRemotesMap, deriveMFE } from "../../src/vite/derive.js";

const AUTO_MIN = 5173;
const AUTO_MAX = 5273;

// An adapter with a defaultPort, to prove it can't pull the two sides apart.
const adapter: FrameworkAdapter = { id: "x", plugins: () => [], defaultPort: 5200 };

const nameArb = fc.stringMatching(/^[a-z_][a-z0-9_]{0,11}$/u);

/** Manifests with unique names, a mix of explicit and omitted ports. */
const manifestArb = fc
  .record({
    names: fc.uniqueArray(nameArb, { minLength: 1, maxLength: 25 }),
    explicit: fc.array(fc.option(fc.integer({ min: 1024, max: 65535 }), { nil: undefined }), {
      maxLength: 25,
    }),
    shellPort: fc.option(fc.integer({ min: 1024, max: 65535 }), { nil: undefined }),
  })
  .map(({ names, explicit, shellPort }): MFKitConfig => {
    const mfes: MFEManifestEntry[] = names.map((name, i) => ({
      name,
      framework: "x",
      path: `apps/${name}`,
      route: `/${name}`,
      exposes: {},
      ...(explicit[i] !== undefined ? { port: explicit[i] } : {}),
    }));
    return {
      version: MFKIT_CONFIG_VERSION,
      name: "p",
      shell: {
        name: "shell",
        framework: "x",
        path: "apps/shell",
        ...(shellPort !== undefined ? { port: shellPort } : {}),
      },
      mfes,
    };
  })
  // Only manifests defineConfig accepts (unique explicit ports, no shell clash).
  .filter((c) => {
    try {
      defineConfig(c);
      return true;
    } catch (e) {
      if (e instanceof MFKitConfigError) return false;
      throw e;
    }
  });

const urlPort = (url: string | undefined) => Number(new URL(url ?? "").port);

describe("port resolution properties", () => {
  it("every MFE serves on exactly the port the shell fetches it from (R1)", () => {
    fc.assert(
      fc.property(manifestArb, (config) => {
        const remotes = buildRemotesMap(config, "dev");
        for (const entry of config.mfes) {
          expect(deriveMFE(config, entry, adapter).port).toBe(urlPort(remotes[entry.name]));
        }
      }),
    );
  });

  it("resolved ports are unique and never the shell's effective port", () => {
    fc.assert(
      fc.property(manifestArb, (config) => {
        const ports = config.mfes.map((e) => deriveMFE(config, e, adapter).port);
        expect(new Set(ports).size).toBe(ports.length);
        expect(ports).not.toContain(config.shell.port ?? DEFAULT_SHELL_PORT);
      }),
    );
  });

  it("auto-assigned ports stay in range; explicit ports are kept verbatim", () => {
    fc.assert(
      fc.property(manifestArb, (config) => {
        for (const entry of config.mfes) {
          const port = deriveMFE(config, entry, adapter).port;
          if (entry.port !== undefined) expect(port).toBe(entry.port);
          else {
            expect(port).toBeGreaterThanOrEqual(AUTO_MIN);
            expect(port).toBeLessThanOrEqual(AUTO_MAX);
          }
        }
      }),
    );
  });

  it("assignment depends on the set of MFEs, not their order in the manifest", () => {
    fc.assert(
      fc.property(manifestArb, fc.func(fc.integer()), (config, key) => {
        const shuffled = {
          ...config,
          mfes: [...config.mfes].sort((a, b) => key(a.name) - key(b.name)),
        };
        const a = buildRemotesMap(config, "dev");
        const b = buildRemotesMap(shuffled, "dev");
        for (const entry of config.mfes) expect(b[entry.name]).toBe(a[entry.name]);
      }),
    );
  });

  it("is deterministic across calls", () => {
    fc.assert(
      fc.property(manifestArb, (config) => {
        expect(buildRemotesMap(config, "dev")).toEqual(buildRemotesMap(config, "dev"));
      }),
    );
  });
});

describe("defineConfig never throws anything but MFKitConfigError", () => {
  it("for arbitrary input", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        try {
          defineConfig(input as MFKitConfig);
        } catch (e) {
          expect(e).toBeInstanceOf(MFKitConfigError);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("for near-valid manifests with arbitrary field values", () => {
    const loose = fc.record({
      version: fc.oneof(fc.constant(1), fc.anything()),
      name: fc.oneof(fc.string(), fc.anything()),
      shell: fc.oneof(
        fc.record({
          name: fc.anything(),
          framework: fc.anything(),
          path: fc.anything(),
          port: fc.anything(),
        }),
        fc.anything(),
      ),
      mfes: fc.oneof(
        fc.array(
          fc.record({
            name: fc.anything(),
            route: fc.anything(),
            framework: fc.anything(),
            path: fc.anything(),
            port: fc.anything(),
          }),
        ),
        fc.anything(),
      ),
    });
    fc.assert(
      fc.property(loose, (input) => {
        try {
          defineConfig(input as unknown as MFKitConfig);
        } catch (e) {
          expect(e).toBeInstanceOf(MFKitConfigError);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("auto-port exhaustion", () => {
  it("both sides report the same actionable error", () => {
    const mfes: MFEManifestEntry[] = Array.from({ length: AUTO_MAX - AUTO_MIN + 2 }, (_, i) => ({
      name: `m${i}`,
      framework: "x",
      path: `a/${i}`,
      route: `/${i}`,
      exposes: {},
    }));
    const config: MFKitConfig = {
      version: MFKIT_CONFIG_VERSION,
      name: "p",
      shell: { name: "s", framework: "x", path: "s" },
      mfes,
    };
    const expected = /all 101 ports in 5173\.\.5273 are taken/;
    expect(() => buildRemotesMap(config, "dev")).toThrow(expected);
    const unlucky = mfes.find((m) => {
      try {
        deriveMFE(config, m, adapter);
        return false;
      } catch {
        return true;
      }
    });
    expect(unlucky).toBeDefined();
    expect(() => deriveMFE(config, unlucky!, adapter)).toThrow(expected);
  });
});
