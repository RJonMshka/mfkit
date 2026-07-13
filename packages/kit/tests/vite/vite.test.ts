import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  type FrameworkAdapter,
  MFKIT_CONFIG_VERSION,
  type MFKitConfig,
  MFKitConfigError,
} from "../../src/index.js";
import { mfkitMFE, mfkitShell } from "../../src/vite.js";

// mfkitMFE probes the filesystem to infer the lifecycle expose, so these tests
// run against a fixture workspace rather than a manifest pointing at nothing.
const FIXTURE_CWD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/workspace",
);

// @module-federation/vite inspects the surrounding Vite build context and
// returns no plugins outside one — which makes it useless for this integration
// test. We replace it with a deterministic stub that proves the call wiring
// (name/filename/exposes/remotes/shared all reach it) without depending on
// the real plugin's internals.
const federationCalls: Array<Record<string, unknown>> = [];
vi.mock("@module-federation/vite", () => ({
  federation: (opts: Record<string, unknown>) => {
    federationCalls.push(opts);
    return [{ name: "stub:module-federation" }];
  },
}));

// A no-op adapter used to keep these tests free of real framework plugins —
// the lazy-loaded built-ins are exercised by adapter-resolve.test.ts.
const stubAdapter: FrameworkAdapter = {
  id: "react",
  defaultShared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
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

describe("mfkitMFE", () => {
  it("returns a UserConfig with port, build target, and federation plugin", async () => {
    federationCalls.length = 0;
    const cfg = await mfkitMFE(baseConfig, "mfe_a", {
      adapters: [stubAdapter],
      logInferred: false,
      cwd: FIXTURE_CWD,
    });

    expect(cfg.server?.port).toBe(4001);
    expect(cfg.preview?.port).toBe(4001);
    expect(cfg.build?.target).toBe("esnext");
    expect(cfg.plugins?.length).toBeGreaterThan(0);
    expect(federationCalls).toHaveLength(1);
    expect(federationCalls[0]).toMatchObject({
      name: "mfe_a",
      filename: "remoteEntry.js",
      exposes: { "./lifecycle": "./src/lifecycle.ts" },
      shared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
    });
  });

  it("throws if the MFE name is not in the manifest", async () => {
    await expect(
      mfkitMFE(baseConfig, "missing", {
        adapters: [stubAdapter],
        logInferred: false,
        cwd: FIXTURE_CWD,
      }),
    ).rejects.toBeInstanceOf(MFKitConfigError);
  });

  it("infers a .tsx lifecycle — a React MFE's lifecycle is not .ts", async () => {
    federationCalls.length = 0;
    const config: MFKitConfig = {
      ...baseConfig,
      mfes: [
        { name: "mfe_tsx", framework: "react", path: "apps/mfe-tsx", route: "/x", port: 4002 },
      ],
    };

    await mfkitMFE(config, "mfe_tsx", {
      adapters: [stubAdapter],
      logInferred: false,
      cwd: FIXTURE_CWD,
    });

    expect(federationCalls[0]).toMatchObject({
      exposes: { "./lifecycle": "./src/lifecycle.tsx" },
    });
  });

  it("fails with an actionable MFKitConfigError when no lifecycle module exists", async () => {
    const config: MFKitConfig = {
      ...baseConfig,
      mfes: [
        { name: "mfe_empty", framework: "react", path: "apps/mfe-empty", route: "/e", port: 4003 },
      ],
    };

    // Without the probe this failed deep inside the MF plugin, with nothing
    // pointing at the invented path (dx-findings #5).
    await expect(
      mfkitMFE(config, "mfe_empty", {
        adapters: [stubAdapter],
        logInferred: false,
        cwd: FIXTURE_CWD,
      }),
    ).rejects.toThrow(/no lifecycle module was found/);
  });

  it("honours user-supplied exposes without probing the filesystem", async () => {
    federationCalls.length = 0;
    const config: MFKitConfig = {
      ...baseConfig,
      mfes: [
        {
          name: "mfe_custom",
          framework: "react",
          path: "apps/does-not-exist",
          route: "/c",
          port: 4004,
          exposes: { "./lifecycle": "./src/custom-entry.ts" },
        },
      ],
    };

    await mfkitMFE(config, "mfe_custom", {
      adapters: [stubAdapter],
      logInferred: false,
      cwd: FIXTURE_CWD,
    });

    expect(federationCalls[0]).toMatchObject({
      exposes: { "./lifecycle": "./src/custom-entry.ts" },
    });
  });
});

describe("mfkitShell", () => {
  it("returns a UserConfig with shell port and federation plugin (with remotes map)", async () => {
    federationCalls.length = 0;
    const cfg = await mfkitShell(baseConfig, {
      adapters: [stubAdapter],
      logInferred: false,
      mode: "dev",
    });

    expect(cfg.server?.port).toBe(3000);
    expect(cfg.preview?.port).toBe(3000);
    expect(cfg.plugins?.length).toBeGreaterThan(0);
    expect(federationCalls).toHaveLength(1);
    expect(federationCalls[0]).toMatchObject({
      name: "shell",
      // Object form with type "module": vite-built remote entries are ESM,
      // and string remotes would default to broken script-injection loading.
      remotes: {
        mfe_a: { type: "module", name: "mfe_a", entry: "http://localhost:4001/remoteEntry.js" },
      },
    });
    expect(federationCalls[0]?.exposes).toBeUndefined();
  });
});
