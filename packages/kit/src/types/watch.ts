// Thin fs.watch wrapper around writeRemoteTypes.
//
// The watcher does not parse mfkit.config.ts itself — kit accepts a manifest
// object, not a source file. Instead, consumers supply a `reload()` callback
// that returns a fresh MFKitConfig whenever a watched file fires. This keeps
// kit decoupled from how the manifest is authored (TS, JS, JSON, generated)
// and matches the "manifest is the single source of truth" invariant.
//
// Forgiving by default: a single failing reload logs and continues; the
// watcher only tears down when explicitly closed. Errors surface via the
// optional `onError` hook so callers can wire telemetry.

import { type FSWatcher, watch } from "node:fs";
import { resolve } from "node:path";

import type { MFKitConfig } from "@mfkit/plugin-api";

import {
  type WriteRemoteTypesOptions,
  type WriteRemoteTypesResult,
  writeRemoteTypes,
} from "./write.js";

export interface WatchRemoteTypesOptions extends WriteRemoteTypesOptions {
  /**
   * Files whose changes should trigger regeneration. Usually `mfkit.config.ts`
   * plus any imported manifest fragments. Paths resolve from `cwd`.
   */
  readonly watchPaths: readonly string[];
  /**
   * Called when any watched file changes. Should return the *current*
   * manifest. Async to accommodate dynamic-import reloads.
   */
  readonly reload: () => MFKitConfig | Promise<MFKitConfig>;
  /** Debounce window in ms (coalesces editor save-storms). Default 100. */
  readonly debounceMs?: number;
  /** Called after every successful write (including no-op). */
  readonly onWrite?: (result: WriteRemoteTypesResult) => void;
  /** Called when reload/write throws. Default: log to console.warn. */
  readonly onError?: (err: unknown) => void;
}

export interface RemoteTypesWatcher {
  /** Stop watching and release fs.watch handles. */
  close(): Promise<void>;
  /** Force an immediate regenerate, bypassing the debounce. */
  trigger(): Promise<void>;
}

/**
 * Start watching the supplied source paths and regenerate the remote `.d.ts`
 * whenever any of them change. The first regeneration uses the `config`
 * passed at start; every subsequent regeneration calls `reload()` first.
 */
export function watchRemoteTypes(
  config: MFKitConfig,
  opts: WatchRemoteTypesOptions,
): RemoteTypesWatcher {
  const cwd = opts.cwd ?? process.cwd();
  const debounceMs = opts.debounceMs ?? 100;
  const onError =
    opts.onError ??
    ((err: unknown): void => {
      // eslint-disable-next-line no-console
      console.warn("[mfkit/types] regeneration failed:", err instanceof Error ? err.message : err);
    });

  const watchers: FSWatcher[] = [];
  let closed = false;
  let timer: NodeJS.Timeout | null = null;
  let pending = Promise.resolve();
  let current = config;

  const regenerate = async (useReload: boolean): Promise<void> => {
    try {
      if (useReload) current = await opts.reload();
      const result = await writeRemoteTypes(current, opts);
      opts.onWrite?.(result);
    } catch (err) {
      onError(err);
    }
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = pending.then(() => regenerate(true));
    }, debounceMs);
  };

  // Initial emit uses the manifest already in hand — no reload on the first
  // pass. This guarantees the file exists before the watcher returns.
  pending = pending.then(() => regenerate(false));

  for (const rel of opts.watchPaths) {
    const abs = resolve(cwd, rel);
    try {
      watchers.push(watch(abs, schedule));
    } catch (err) {
      onError(err);
    }
  }

  return {
    async close(): Promise<void> {
      closed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      for (const w of watchers) w.close();
      await pending;
    },
    async trigger(): Promise<void> {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = pending.then(() => regenerate(true));
      await pending;
    },
  };
}
