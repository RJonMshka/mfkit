// @vitest-environment happy-dom
//
// Executes the generated injection snippet in a DOM rather than asserting on
// its source text.

import { afterEach, describe, expect, it } from "vitest";

import { cssInjectedByJs } from "../../src/vite/css-inject.js";

function injectedCode(remoteName: string, css: string): string {
  const bundle: Record<string, unknown> = {
    "style.css": { type: "asset", source: css },
    "remoteEntry.js": { type: "chunk", isEntry: true, code: "" },
  };
  const plugin = cssInjectedByJs({ remoteName });
  (plugin.generateBundle as (o: unknown, b: unknown) => void).call({}, {}, bundle);
  return (bundle["remoteEntry.js"] as { code: string }).code;
}

afterEach(() => {
  document.head.innerHTML = "";
});

describe("CSS injection snippet in a DOM", () => {
  it("injects one <style> per remote, idempotently", () => {
    const code = injectedCode("mfe_clock", ".clock{padding:16px}");
    new Function(code)();
    new Function(code)();
    const styles = document.head.querySelectorAll("style#mfkit-css-mfe_clock");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe(".clock{padding:16px}");
  });

  // Review O6: strict-CSP hosts block un-nonced inline styles.
  it("copies the host's CSP nonce from <meta property=csp-nonce>", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", "csp-nonce");
    meta.setAttribute("nonce", "r4nd0m");
    document.head.appendChild(meta);
    new Function(injectedCode("mfe_a", ".a{}"))();
    const style = document.getElementById("mfkit-css-mfe_a") as HTMLStyleElement;
    expect(style.nonce || style.getAttribute("nonce")).toBe("r4nd0m");
  });

  it("adds no nonce when the host declares none", () => {
    new Function(injectedCode("mfe_b", ".b{}"))();
    const style = document.getElementById("mfkit-css-mfe_b") as HTMLStyleElement;
    expect(style.nonce || style.getAttribute("nonce") || "").toBe("");
  });
});
