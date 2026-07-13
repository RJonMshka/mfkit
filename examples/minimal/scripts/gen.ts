// Regenerates everything derived from mfkit.config.ts:
//   - .mfkit/generated/remotes.d.ts  — typed federated imports for the shell
//   - .mfkit/generated/turbo.json    — dev orchestration (shell#dev waits on MFEs)
// Run with `pnpm gen` after editing the manifest.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateTurboConfig } from "@mfkit/kit/turbo";
import { writeRemoteTypes } from "@mfkit/kit/types";

import config from "../mfkit.config";

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const types = await writeRemoteTypes(config, { cwd: exampleRoot });
console.log(`${types.unchanged ? "unchanged" : "wrote"}  ${types.outPath}`);

const turbo = generateTurboConfig(config, { cwd: exampleRoot });
const turboPath = resolve(exampleRoot, ".mfkit/generated/turbo.json");
await mkdir(dirname(turboPath), { recursive: true });
await writeFile(turboPath, `${JSON.stringify(turbo, null, 2)}\n`, "utf8");
console.log(`wrote      ${turboPath}`);
