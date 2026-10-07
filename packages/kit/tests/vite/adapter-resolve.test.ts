import { describe, expect, it } from "vitest";

import { type FrameworkAdapter, MFKitConfigError } from "../../src/index.js";
import { peerInstallHint, resolveAdapter } from "../../src/vite/adapter-resolve.js";

describe("resolveAdapter", () => {
  it("returns user-supplied adapter when id matches (wins over built-in)", async () => {
    const fake: FrameworkAdapter = { id: "react", plugins: () => [] };
    const r = await resolveAdapter("react", [fake]);
    expect(r).toBe(fake);
  });

  it("resolves a built-in adapter for known ids", async () => {
    const r = await resolveAdapter("lit");
    expect(r.id).toBe("lit");
    expect(r.plugins({} as never)).toEqual([]);
  });

  it("throws MFKitConfigError for unknown framework", async () => {
    await expect(resolveAdapter("ember")).rejects.toBeInstanceOf(MFKitConfigError);
    await expect(resolveAdapter("ember")).rejects.toThrow(/No FrameworkAdapter for "ember"/);
  });
});

describe("built-in adapter shared defaults", () => {
  // Review O2: a hardcoded requiredVersion went stale, and the MF plugin also
  // derives the *provided* version from it — a React 19 shell advertised
  // react@18.0.0. Leave it unset so the plugin reads the installed version.
  // Angular is checked separately: its plugin needs @angular/compiler-cli,
  // which this repo doesn't install (no Angular example yet — see L7).
  it.each([
    "react",
    "vue",
    "svelte",
    "lit",
  ])("%s declares singletons without pinning requiredVersion", async (id) => {
    const adapter = await resolveAdapter(id);
    for (const [pkg, dep] of Object.entries(adapter.defaultShared ?? {})) {
      expect(dep.singleton, pkg).toBe(true);
      expect(dep.requiredVersion, pkg).toBeUndefined();
    }
  });
});

describe("peerInstallHint", () => {
  it("names the adapter's peer when the peer itself is missing", () => {
    const err = new Error(
      "Cannot find package '@vitejs/plugin-react' imported from /x/dist/vite-adapters/react.js",
    );
    const hint = peerInstallHint("react", err);
    expect(hint).toContain("@vitejs/plugin-react is not installed");
    expect(hint).toContain("pnpm add -D @vitejs/plugin-react");
  });

  // Regression: the peer's name appeared in the "imported from" path, so the
  // hint told users to install a package they already had.
  it("names the transitive package when the peer is installed but its peer is not", () => {
    const err = new Error(
      "Cannot find package '@angular/compiler-cli' imported from /n/@analogjs/vite-plugin-angular/src/lib/plugin.js",
    );
    const hint = peerInstallHint("angular", err);
    expect(hint).toContain(
      "@angular/compiler-cli is not installed (required by @analogjs/vite-plugin-angular)",
    );
    expect(hint).toContain("pnpm add -D @angular/compiler-cli");
  });

  it("returns null for unrelated errors", () => {
    expect(peerInstallHint("react", new Error("SyntaxError: boom"))).toBeNull();
    expect(peerInstallHint("lit", new Error("Cannot find package 'x'"))).toBeNull();
  });
});
