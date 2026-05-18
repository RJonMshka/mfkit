import { describe, expect, it } from "vitest";

import { MFKIT_CONFIG_VERSION, type MFKitConfig } from "../../src/index.js";
import { generateRemoteTypes } from "../../src/types/generate.js";

function baseConfig(): MFKitConfig {
  return {
    version: MFKIT_CONFIG_VERSION,
    name: "host",
    shell: { name: "shell", framework: "react", path: "apps/shell" },
    mfes: [
      { name: "mfe_a", framework: "react", path: "apps/mfe-a", route: "/a" },
      { name: "mfe_b", framework: "svelte", path: "apps/mfe-b", route: "/b" },
    ],
  };
}

describe("generateRemoteTypes defaults", () => {
  it("emits one declare-module block per MFE using the default ./lifecycle expose", () => {
    const out = generateRemoteTypes(baseConfig());
    expect(out).toContain('declare module "mfe_a/lifecycle"');
    expect(out).toContain('declare module "mfe_b/lifecycle"');
    expect(out).toContain('import type { MFEDefinition } from "@mfkit/plugin-api"');
    expect(out).toContain("const lifecycle: MFEDefinition;");
    expect(out).toContain("export default lifecycle;");
  });

  it("includes a generated-file banner at the top", () => {
    const out = generateRemoteTypes(baseConfig());
    expect(out.startsWith("// AUTO-GENERATED")).toBe(true);
  });

  it("ends with a trailing newline", () => {
    const out = generateRemoteTypes(baseConfig());
    expect(out.endsWith("\n")).toBe(true);
  });

  it("is deterministic — identical input produces identical output", () => {
    const a = generateRemoteTypes(baseConfig());
    const b = generateRemoteTypes(baseConfig());
    expect(a).toBe(b);
  });

  it("emits MFEs in manifest order", () => {
    const out = generateRemoteTypes(baseConfig());
    const idxA = out.indexOf('"mfe_a/lifecycle"');
    const idxB = out.indexOf('"mfe_b/lifecycle"');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });
});

describe("generateRemoteTypes custom exposes", () => {
  it("respects user-supplied expose keys and strips the leading './'", () => {
    const cfg: MFKitConfig = {
      ...baseConfig(),
      mfes: [
        {
          name: "mfe_a",
          framework: "react",
          path: "apps/mfe-a",
          route: "/a",
          exposes: {
            "./lifecycle": "./src/lifecycle.ts",
            "./components/Button": "./src/components/Button.tsx",
          },
        },
      ],
    };
    const out = generateRemoteTypes(cfg);
    expect(out).toContain('declare module "mfe_a/lifecycle"');
    expect(out).toContain('declare module "mfe_a/components/Button"');
  });

  it("falls back to ./lifecycle when exposes is an empty object", () => {
    const cfg: MFKitConfig = {
      ...baseConfig(),
      mfes: [
        {
          name: "mfe_a",
          framework: "react",
          path: "apps/mfe-a",
          route: "/a",
          exposes: {},
        },
      ],
    };
    const out = generateRemoteTypes(cfg);
    expect(out).toContain('declare module "mfe_a/lifecycle"');
  });

  it("preserves expose-key order in the output", () => {
    const cfg: MFKitConfig = {
      ...baseConfig(),
      mfes: [
        {
          name: "mfe_a",
          framework: "react",
          path: "apps/mfe-a",
          route: "/a",
          exposes: {
            "./z": "./src/z.ts",
            "./a": "./src/a.ts",
          },
        },
      ],
    };
    const out = generateRemoteTypes(cfg);
    const idxZ = out.indexOf('"mfe_a/z"');
    const idxA = out.indexOf('"mfe_a/a"');
    expect(idxZ).toBeGreaterThan(-1);
    expect(idxA).toBeGreaterThan(idxZ);
  });
});

describe("generateRemoteTypes edge cases", () => {
  it("emits 'export {}' when the manifest has no MFEs (still a valid module)", () => {
    const cfg: MFKitConfig = { ...baseConfig(), mfes: [] };
    const out = generateRemoteTypes(cfg);
    expect(out).toContain("export {};");
    expect(out).not.toContain("declare module");
  });

  it("honors the contractPackage override", () => {
    const out = generateRemoteTypes(baseConfig(), {
      contractPackage: "@my-app/contracts",
    });
    expect(out).toContain('from "@my-app/contracts"');
    expect(out).not.toContain('from "@mfkit/plugin-api"');
  });

  it("honors the banner override", () => {
    const out = generateRemoteTypes(baseConfig(), { banner: "// custom" });
    expect(out.startsWith("// custom\n\n")).toBe(true);
  });

  it("throws MFKitConfigError when the config is malformed", () => {
    expect(() =>
      generateRemoteTypes(null as unknown as MFKitConfig),
    ).toThrow(/expected a validated MFKitConfig/);
  });
});
