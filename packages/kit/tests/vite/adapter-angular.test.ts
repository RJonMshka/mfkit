// The real analog plugin needs @angular/compiler-cli, which this repo doesn't
// install yet. The adapter's own data is what's under test, so stub the plugin.
import { describe, expect, it, vi } from "vitest";

vi.mock("@analogjs/vite-plugin-angular", () => ({ default: () => [{ name: "stub:angular" }] }));

describe("angular adapter", () => {
  it("declares singletons without pinning requiredVersion (review O2)", async () => {
    const { default: adapter } = await import("../../src/vite/vite-adapters/angular.js");
    expect(adapter.id).toBe("angular");
    for (const [pkg, dep] of Object.entries(adapter.defaultShared ?? {})) {
      expect(dep.singleton, pkg).toBe(true);
      expect(dep.requiredVersion, pkg).toBeUndefined();
    }
  });
});
