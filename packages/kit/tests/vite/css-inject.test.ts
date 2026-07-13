import { describe, expect, it } from "vitest";

import { cssInjectedByJs } from "../../src/vite/css-inject.js";

// The plugin only implements generateBundle; calling it directly with a
// synthetic bundle is a faithful test — that object *is* the plugin's whole
// contract with rollup.
type Bundle = Record<string, unknown>;

function runGenerateBundle(bundle: Bundle, remoteName = "mfe_a"): Bundle {
  const plugin = cssInjectedByJs({ remoteName });
  const hook = plugin.generateBundle;
  if (typeof hook !== "function") throw new Error("generateBundle is not a function");
  // biome-ignore lint/suspicious/noExplicitAny: rollup's plugin-context type is irrelevant here
  (hook as any).call({}, {}, bundle);
  return bundle;
}

function chunk(code: string, isEntry: boolean) {
  return { type: "chunk", isEntry, code };
}

function asset(source: string) {
  return { type: "asset", source };
}

describe("cssInjectedByJs", () => {
  it("folds emitted CSS into entry chunks and drops the orphaned asset", () => {
    const bundle = runGenerateBundle({
      "remoteEntry.js": chunk("export const x = 1;", true),
      "style.css": asset(".clock { color: red; }"),
    });

    const entry = bundle["remoteEntry.js"] as { code: string };
    expect(entry.code).toContain(".clock { color: red; }");
    expect(entry.code).toContain("document.createElement");
    // Original source must survive, not be replaced.
    expect(entry.code).toContain("export const x = 1;");
    // The asset only the remote's own index.html referenced is now dead weight.
    expect(bundle["style.css"]).toBeUndefined();
  });

  it("leaves non-entry chunks alone", () => {
    const bundle = runGenerateBundle({
      "remoteEntry.js": chunk("entry", true),
      "vendor.js": chunk("vendor", false),
      "style.css": asset("a{}"),
    });

    expect((bundle["vendor.js"] as { code: string }).code).toBe("vendor");
  });

  it("is a no-op when the MFE emits no CSS", () => {
    const bundle = runGenerateBundle({ "remoteEntry.js": chunk("entry", true) });
    expect((bundle["remoteEntry.js"] as { code: string }).code).toBe("entry");
  });

  it("concatenates multiple CSS assets", () => {
    const bundle = runGenerateBundle({
      "remoteEntry.js": chunk("entry", true),
      "a.css": asset(".a{}"),
      "b.css": asset(".b{}"),
    });

    const code = (bundle["remoteEntry.js"] as { code: string }).code;
    expect(code).toContain(".a{}");
    expect(code).toContain(".b{}");
    expect(bundle["a.css"]).toBeUndefined();
    expect(bundle["b.css"]).toBeUndefined();
  });

  it("namespaces the style id per remote so two MFEs don't collide", () => {
    const bundle = runGenerateBundle(
      { "remoteEntry.js": chunk("entry", true), "s.css": asset(".x{}") },
      "mfe_clock",
    );

    expect((bundle["remoteEntry.js"] as { code: string }).code).toContain("mfkit-css-mfe_clock");
  });

  it("emits an idempotent, non-throwing snippet", () => {
    const bundle = runGenerateBundle({
      "remoteEntry.js": chunk("entry", true),
      "s.css": asset(".x{}"),
    });
    const code = (bundle["remoteEntry.js"] as { code: string }).code;

    // Re-injection guard: entry chunks can be loaded more than once on a host.
    expect(code).toContain("document.getElementById(id)");
    // Invariant 5 — a styling failure must not stop the MFE from mounting.
    expect(code).toContain("try{");
    expect(code).toContain("catch");
    // SSR/node consumers importing the chunk must not explode.
    expect(code).toContain('typeof document==="undefined"');
  });
});
