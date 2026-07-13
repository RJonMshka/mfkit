// Shared helper: boot `vite preview` for the shell and both MFEs.
// Ports mirror mfkit.config.ts (the shell port is the kit's 3000 default).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const exampleRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export const apps = [
  { dir: "shell", port: 3000, path: "/", expect: '<div id="root">' },
  { dir: "mfe-hello", port: 5175, path: "/remoteEntry.js", expect: "lifecycle" },
  { dir: "mfe-clock", port: 5176, path: "/remoteEntry.js", expect: "lifecycle" },
];

/** Spawn all preview servers. Returns a stop() that terminates them. */
export function startPreviewServers() {
  const children = [];
  for (const app of apps) {
    const appDir = join(exampleRoot, app.dir);
    if (!existsSync(join(appDir, "dist"))) {
      throw new Error(`${app.dir}/dist missing — run \`pnpm build\` at the repo root first.`);
    }
    const bin = join(appDir, "node_modules", ".bin", "vite");
    children.push(spawn(bin, ["preview"], { cwd: appDir, stdio: "inherit" }));
  }
  return {
    /** Terminate all servers and resolve once every process has exited. */
    stop() {
      return Promise.all(
        children.map(
          (child) =>
            new Promise((done) => {
              if (child.exitCode !== null) return done();
              child.once("exit", done);
              child.kill("SIGTERM");
            }),
        ),
      );
    },
  };
}

/** Poll a URL until it responds 200, then return the body text. */
export async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.text();
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`);
}
