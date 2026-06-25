// File-emission helper for generateRemoteTypes.
//
// Reads the generator's pure output, resolves the destination path, creates
// missing parent directories, and writes — but only when content has actually
// changed. Skipping no-op writes keeps editor file-watchers calm and avoids
// spurious mtime churn that would re-trigger downstream watchers.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { MFKitConfig } from "@mfkit/plugin-api";

import { type GenerateRemoteTypesOptions, generateRemoteTypes } from "./generate.js";

export const DEFAULT_REMOTE_TYPES_PATH = ".mfkit/generated/remotes.d.ts";

export interface WriteRemoteTypesOptions extends GenerateRemoteTypesOptions {
  /**
   * Output file path. Resolved against `cwd` when relative. Defaults to
   * `.mfkit/generated/remotes.d.ts` — generated artifacts cluster under
   * `.mfkit/generated/` so consumers can `.gitignore` the whole tree.
   */
  readonly outFile?: string;
  /** Base directory `outFile` resolves from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

export interface WriteRemoteTypesResult {
  /** Absolute path the file was written to. */
  readonly outPath: string;
  /** The full file contents as written. */
  readonly content: string;
  /** True when the file content already matched and no write happened. */
  readonly unchanged: boolean;
}

/**
 * Generate and persist the federated remote `.d.ts`. The write is skipped
 * (and `unchanged: true` returned) when the existing file already matches
 * byte-for-byte — important for watcher loops that would otherwise feed
 * their own change events back through fs.watch.
 */
export async function writeRemoteTypes(
  config: MFKitConfig,
  opts: WriteRemoteTypesOptions = {},
): Promise<WriteRemoteTypesResult> {
  const cwd = opts.cwd ?? process.cwd();
  const outPath = resolve(cwd, opts.outFile ?? DEFAULT_REMOTE_TYPES_PATH);
  const content = generateRemoteTypes(config, opts);

  const existing = await readIfExists(outPath);
  if (existing === content) {
    return { outPath, content, unchanged: true };
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, "utf8");
  return { outPath, content, unchanged: false };
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
