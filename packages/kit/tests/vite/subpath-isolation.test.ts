// Subpath isolation check.
//
// The promise of @mfkit/kit/vite is: a Svelte-only consumer pays for nothing
// React. That promise lives or dies on the build output, not the source code —
// so this test reads the built dist/vite.js and asserts no eager static
// import of any framework Vite plugin survives bundling. Adapters are pulled
// in via Function-wrapped dynamic import; they should only land in their own
// vite-adapters/*.js chunks.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FRAMEWORK_PEERS = [
  "@vitejs/plugin-react",
  "@sveltejs/vite-plugin-svelte",
  "@vitejs/plugin-vue",
  "@analogjs/vite-plugin-angular",
];

function read(rel: string): string {
  const url = new URL(`../../dist/${rel}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("dist/vite.js subpath isolation", () => {
  it("does not eagerly import any framework Vite plugin", () => {
    const src = read("vite.js");
    for (const peer of FRAMEWORK_PEERS) {
      const importLine = new RegExp(
        String.raw`(^|\s)import[^;]*from\s*["']${peer.replace(/[/-]/g, "\\$&")}["']`,
        "m",
      );
      expect(src).not.toMatch(importLine);
    }
  });

  it("does not pull react/react-dom into the vite entry", () => {
    const src = read("vite.js");
    expect(src).not.toMatch(/from\s*["']react["']/);
    expect(src).not.toMatch(/from\s*["']react-dom["']/);
  });

  it("adapter chunks import their own framework peer only", () => {
    const react = read("vite-adapters/react.js");
    expect(react).toContain("@vitejs/plugin-react");
    expect(react).not.toContain("@vitejs/plugin-vue");
    expect(react).not.toContain("@sveltejs/vite-plugin-svelte");
    expect(react).not.toContain("@analogjs/vite-plugin-angular");
  });
});

describe("dist/react.js subpath isolation", () => {
  it("does not eagerly import any framework Vite plugin or vite itself", () => {
    const src = read("react.js");
    for (const peer of [...FRAMEWORK_PEERS, "vite", "@module-federation/vite"]) {
      const importLine = new RegExp(
        String.raw`(^|\s)import[^;]*from\s*["']${peer.replace(/[/-]/g, "\\$&")}["']`,
        "m",
      );
      expect(src).not.toMatch(importLine);
    }
  });
});

describe("dist/index.js and dist/healing.js do not pull React", () => {
  it.each(["index.js", "healing.js"])("%s has no react import", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/from\s*["']react["']/);
    expect(src).not.toMatch(/from\s*["']react-dom["']/);
  });
});

describe("dist/turbo.js subpath isolation", () => {
  it("does not eagerly import vite, framework plugins, react, or @module-federation/vite", () => {
    const src = read("turbo.js");
    for (const peer of [
      ...FRAMEWORK_PEERS,
      "vite",
      "@module-federation/vite",
      "react",
      "react-dom",
    ]) {
      const importLine = new RegExp(
        String.raw`(^|\s)import[^;]*from\s*["']${peer.replace(/[/-]/g, "\\$&")}["']`,
        "m",
      );
      expect(src).not.toMatch(importLine);
    }
  });
});
