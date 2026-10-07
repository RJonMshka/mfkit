#!/usr/bin/env node
// L4 package test (docs/testing-and-evaluation.md): install what we *publish*
// into a fresh project, the way a consumer would, and use it.
//
//   1. `pnpm pack` every @mfkit/* package (workspace:* → real versions)
//   2. fresh npm project, Svelte-only: install the tarballs + vite + MF plugin,
//      but no React. Every non-React subpath must import, and React must not
//      have been pulled in (invariant 2, checked against the artifact, not the
//      source graph).
//   3. the installed `mfkit-migrate` bin must run through node_modules/.bin
//      (review R4 shipped exactly this bug).
//
// Requires network (npm registry) and built packages (`pnpm build`).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "mfkit-pack-"));
const tarballs = join(work, "tarballs");
const app = join(work, "app");
const keep = process.argv.includes("--keep");

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let failed = false;
const check = (label, fn) => {
  try {
    fn();
    console.log(`ok  ${label}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${label}\n     ${err instanceof Error ? err.message : String(err)}`);
  }
};

try {
  for (const pkg of ["plugin-api", "kit", "codemods"]) {
    run("pnpm", ["pack", "--pack-destination", tarballs], join(root, "packages", pkg));
  }
  const tgz = readdirSync(tarballs).map((f) => join(tarballs, f));
  console.log(`packed ${tgz.length} tarballs`);

  run("mkdir", ["-p", app], work);
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "pack-check", private: true, type: "module" }, null, 2),
  );
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      ...tgz,
      "vite@6",
      "@module-federation/vite",
      "@sveltejs/vite-plugin-svelte@5",
      "svelte@5",
    ],
    app,
  );
  console.log("installed into a fresh Svelte-only project");

  const probe = `
    await import("@mfkit/plugin-api");
    const kit = await import("@mfkit/kit");
    if (typeof kit.defineConfig !== "function") throw new Error("defineConfig missing");
    await import("@mfkit/kit/healing");
    await import("@mfkit/kit/turbo");
    await import("@mfkit/kit/types");
    const vite = await import("@mfkit/kit/vite");
    const config = kit.defineConfig({
      version: 1, name: "p",
      shell: { name: "shell", framework: "svelte", path: "shell" },
      mfes: [{ name: "mfe_s", framework: "svelte", route: "/s", path: "mfe", exposes: { "./lifecycle": "./src/lifecycle.ts" } }],
    });
    const cfg = await vite.mfkitMFE(config, "mfe_s", { logInferred: false });
    if (!cfg.plugins?.length) throw new Error("mfkitMFE produced no plugins");
    await import("@mfkit/codemods");
    console.log("imports ok");
  `;
  check("every non-React subpath imports and mfkitMFE runs for svelte", () => {
    run("node", ["--input-type=module", "-e", probe], app);
  });

  check("React was not installed (optional peers stay optional)", () => {
    const req = createRequire(join(app, "package.json"));
    for (const name of ["react", "react-dom", "@vitejs/plugin-react"]) {
      try {
        req.resolve(name);
        throw new Error(`${name} is resolvable — something pulled it in`);
      } catch (err) {
        if (err instanceof Error && err.message.includes("resolvable")) throw err;
      }
    }
  });

  check("mfkit-migrate runs through node_modules/.bin", () => {
    const out = run(join(app, "node_modules", ".bin", "mfkit-migrate"), ["list"], app);
    if (!out.includes("No codemods registered")) {
      throw new Error(`unexpected output: ${JSON.stringify(out)}`);
    }
  });
} catch (err) {
  failed = true;
  const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
  console.error(
    `pack-check aborted: ${err instanceof Error ? err.message : String(err)}\n${stderr}`,
  );
} finally {
  if (keep) console.log(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

console.log(failed ? "pack-check FAILED" : "pack-check passed");
process.exit(failed ? 1 : 0);
