/**
 * Compile-time contract tests for @mfkit/plugin-api.
 *
 * These are not behavior tests — there is no behavior to test. They exist to
 * lock the shape of every public type. A breaking edit to the plugin contract
 * surfaces here as a compile error, forcing the author to acknowledge the
 * change explicitly (and ship a codemod once codemods exist).
 */

import { describe, expectTypeOf, it } from "vitest";
import {
  type FrameworkAdapter,
  type FrameworkId,
  type HealingDecision,
  type HealingStrategy,
  type MFEContext,
  type MFEDefinition,
  type MFEManifestEntry,
  MFKIT_CONFIG_VERSION,
  type MFKitConfig,
  type MFKitOutletPropsBase,
  type MFKitPlugin,
  type SharedDependency,
  type ShellConfig,
  type VersionMismatchVerdict,
} from "../src/index.js";

describe("MFKIT_CONFIG_VERSION", () => {
  it("is the literal 1", () => {
    expectTypeOf<typeof MFKIT_CONFIG_VERSION>().toEqualTypeOf<1>();
  });
});

describe("FrameworkId", () => {
  it("permits the built-in union members", () => {
    expectTypeOf<"react">().toMatchTypeOf<FrameworkId>();
    expectTypeOf<"svelte">().toMatchTypeOf<FrameworkId>();
    expectTypeOf<"vue">().toMatchTypeOf<FrameworkId>();
    expectTypeOf<"angular">().toMatchTypeOf<FrameworkId>();
    expectTypeOf<"lit">().toMatchTypeOf<FrameworkId>();
  });

  it("also accepts plugin-supplied strings while preserving autocomplete", () => {
    expectTypeOf<"solid-js">().toMatchTypeOf<FrameworkId>();
  });
});

describe("MFEDefinition", () => {
  it("requires mount(el, ctx, props?) and unmount(el)", () => {
    const def: MFEDefinition<{ user: string }> = {
      mount(el, ctx, props) {
        expectTypeOf(el).toEqualTypeOf<HTMLElement>();
        expectTypeOf(ctx).toEqualTypeOf<MFEContext>();
        expectTypeOf(props).toEqualTypeOf<{ user: string } | undefined>();
      },
      unmount(el) {
        expectTypeOf(el).toEqualTypeOf<HTMLElement>();
      },
    };
    expectTypeOf(def.mount).returns.toEqualTypeOf<Promise<void> | void>();
    expectTypeOf(def.unmount).returns.toEqualTypeOf<Promise<void> | void>();
  });

  it("defaults Props to unknown", () => {
    const def: MFEDefinition = {
      mount(_el, _ctx, props) {
        expectTypeOf(props).toEqualTypeOf<unknown>();
      },
      unmount() {},
    };
    void def;
  });
});

describe("MFEContext", () => {
  it("exposes basePath, mountId, and an AbortSignal", () => {
    expectTypeOf<MFEContext["basePath"]>().toEqualTypeOf<string>();
    expectTypeOf<MFEContext["mountId"]>().toEqualTypeOf<string>();
    expectTypeOf<MFEContext["signal"]>().toEqualTypeOf<AbortSignal>();
  });
});

describe("MFKitConfig", () => {
  it("requires version, name, shell, mfes", () => {
    const cfg: MFKitConfig = {
      version: MFKIT_CONFIG_VERSION,
      name: "devnexus",
      shell: { name: "shell", path: "apps/shell", framework: "react" },
      mfes: [
        {
          name: "mfe_metrics",
          route: "/metrics",
          framework: "svelte",
          path: "apps/mfe-metrics",
        },
      ],
    };
    expectTypeOf(cfg.shell).toEqualTypeOf<ShellConfig>();
    expectTypeOf(cfg.mfes).toEqualTypeOf<readonly MFEManifestEntry[]>();
  });

  it("treats shared/budgets/healing/discovery/plugins as optional", () => {
    type OptionalKeys = "shared" | "budgets" | "healing" | "discovery" | "plugins";
    expectTypeOf<Pick<MFKitConfig, OptionalKeys>>().toMatchTypeOf<
      Partial<Pick<MFKitConfig, OptionalKeys>>
    >();
  });
});

describe("SharedDependency", () => {
  it("all four fields are optional", () => {
    const _empty: SharedDependency = {};
    const _full: SharedDependency = {
      singleton: true,
      strictVersion: true,
      requiredVersion: "^18.0.0",
      eager: false,
    };
    void _empty;
    void _full;
  });
});

describe("HealingDecision", () => {
  it("is a discriminated union on `action`", () => {
    const retry: HealingDecision = { action: "retry", afterMs: 500 };
    const quarantine: HealingDecision = { action: "quarantine" };
    const fail: HealingDecision = { action: "fail", reason: "out of attempts" };
    expectTypeOf(retry.action).toEqualTypeOf<"retry">();
    expectTypeOf(quarantine.action).toEqualTypeOf<"quarantine">();
    expectTypeOf(fail.action).toEqualTypeOf<"fail">();
  });

  it("retry requires afterMs", () => {
    // @ts-expect-error -- retry without afterMs must not type-check
    const _bad: HealingDecision = { action: "retry" };
    void _bad;
  });
});

describe("HealingStrategy", () => {
  it("declares hooks for load/mount/version-mismatch", () => {
    expectTypeOf<HealingStrategy["onLoadError"]>().parameters.toMatchTypeOf<
      [{ entry: MFEManifestEntry; attempt: number; error: Error }]
    >();
    expectTypeOf<
      HealingStrategy["onVersionMismatch"]
    >().returns.toEqualTypeOf<VersionMismatchVerdict>();
  });
});

describe("FrameworkAdapter", () => {
  it("is generic over the bundler plugin shape", () => {
    type ViteIshPlugin = { name: string };
    const adapter: FrameworkAdapter<ViteIshPlugin> = {
      id: "react",
      plugins: () => [{ name: "@vitejs/plugin-react" }],
    };
    expectTypeOf(adapter.plugins).returns.toEqualTypeOf<readonly ViteIshPlugin[]>();
  });
});

describe("MFKitPlugin", () => {
  it("is a bag of optional contributions", () => {
    const plugin: MFKitPlugin = { name: "my-plugin" };
    expectTypeOf(plugin.name).toEqualTypeOf<string>();
    expectTypeOf(plugin.frameworkAdapters).toEqualTypeOf<readonly FrameworkAdapter[] | undefined>();
  });
});

describe("MFKitOutletPropsBase", () => {
  it("requires remote and accepts callbacks", () => {
    const _props: MFKitOutletPropsBase = {
      remote: "mfe_metrics",
      module: "lifecycle",
      basePath: "/metrics",
      props: { theme: "dark" },
      onMount: () => {},
      onError: (err) => {
        expectTypeOf(err).toEqualTypeOf<Error>();
      },
    };
    void _props;
  });
});
