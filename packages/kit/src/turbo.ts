// @mfkit/kit/turbo — turbo.json generation from mfkit.config.ts.
//
// Pure derivation: manifest → Turbo task config. The only side effect is
// reading each MFE's and the shell's package.json to learn its npm name —
// Turbo identifies workspaces by `name`, but the manifest only knows `path`.
//
// Returns the JSON shape; consumers serialize and write it themselves (or
// hand it to a future `mfkit sync` CLI). No file I/O here keeps the function
// trivially unit-testable and lets users wire whatever orchestration they
// prefer (postinstall hook, npm script, build step).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { MFKitConfig } from "@mfkit/plugin-api";

import { MFKitConfigError } from "./index.js";

export interface TurboTaskConfig {
  readonly dependsOn?: readonly string[];
  readonly outputs?: readonly string[];
  readonly cache?: boolean;
  readonly persistent?: boolean;
  readonly env?: readonly string[];
  readonly inputs?: readonly string[];
}

export interface TurboConfig {
  readonly $schema: string;
  readonly ui?: "tui" | "stream";
  readonly tasks: Readonly<Record<string, TurboTaskConfig>>;
}

export interface GenerateTurboConfigOptions {
  /** Directory paths in the manifest resolve from. Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Override the JSON Schema URL emitted at the top. */
  readonly schemaUrl?: string;
  /** Turbo runner UI. Omit to leave the field off. */
  readonly ui?: "tui" | "stream";
  /**
   * Merged on top of the built-in base tasks (`build`/`dev`/`test`/
   * `typecheck`/`clean`). Per-key shallow-replace — supply the whole config
   * for any task you override.
   */
  readonly baseTasks?: Readonly<Record<string, TurboTaskConfig>>;
  /**
   * Generate `<shell-pkg>#dev` that depends on every `<mfe-pkg>#dev` so
   * `turbo run dev` from the shell brings remotes up first. Defaults true.
   * Disable if your shell tolerates async MFE startup and you prefer the
   * parallel default.
   */
  readonly orchestrateShellDev?: boolean;
}

const DEFAULT_SCHEMA_URL = "https://turbo.build/schema.json";

const DEFAULT_BASE_TASKS: Readonly<Record<string, TurboTaskConfig>> = {
  build: { dependsOn: ["^build"], outputs: ["dist/**"] },
  dev: { cache: false, persistent: true },
  test: { dependsOn: ["^build"], outputs: ["coverage/**"] },
  typecheck: { dependsOn: ["^build"] },
  clean: { cache: false },
};

/**
 * Derive a turbo.json from an MFKit manifest. Pure aside from reading
 * package.json files referenced by `shell.path` and each `mfes[i].path` —
 * needed because Turbo addresses workspaces by their npm `name`, which the
 * manifest doesn't carry (adding it would bump plugin-api).
 *
 * Throws `MFKitConfigError` with a manifest-rooted path when a referenced
 * package.json is missing, unparseable, or lacks a `name`.
 */
export function generateTurboConfig(
  config: MFKitConfig,
  opts: GenerateTurboConfigOptions = {},
): TurboConfig {
  const cwd = opts.cwd ?? process.cwd();
  const orchestrate = opts.orchestrateShellDev ?? true;

  const tasks: Record<string, TurboTaskConfig> = {
    ...DEFAULT_BASE_TASKS,
    ...(opts.baseTasks ?? {}),
  };

  if (orchestrate && config.mfes.length > 0) {
    const shellPkg = readPackageName(cwd, config.shell.path, "shell");
    const mfePkgs = config.mfes.map((m, i) =>
      readPackageName(cwd, m.path, `mfes[${i}]`),
    );
    tasks[`${shellPkg}#dev`] = {
      dependsOn: mfePkgs.map((p) => `${p}#dev`),
      cache: false,
      persistent: true,
    };
  }

  const out: { -readonly [K in keyof TurboConfig]: TurboConfig[K] } = {
    $schema: opts.schemaUrl ?? DEFAULT_SCHEMA_URL,
    tasks,
  };
  if (opts.ui !== undefined) out.ui = opts.ui;
  return out;
}

function readPackageName(cwd: string, relPath: string, scope: string): string {
  const pkgPath = resolve(cwd, relPath, "package.json");

  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch (err) {
    throw new MFKitConfigError(
      `generateTurboConfig: cannot read ${pkgPath} (referenced by ${scope}.path = "${relPath}").\n` +
        `Turbo identifies workspaces by their package name; each MFE and the shell need a package.json with a "name" field.\n` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      [
        {
          path: `${scope}.path`,
          message: `package.json missing or unreadable at "${relPath}"`,
        },
      ],
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MFKitConfigError(
      `generateTurboConfig: ${pkgPath} is not valid JSON.\n` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      [
        {
          path: `${scope}.path`,
          message: `invalid package.json at "${relPath}"`,
        },
      ],
    );
  }

  const name = (parsed as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new MFKitConfigError(
      `generateTurboConfig: ${pkgPath} has no "name" field.\n` +
        `Turbo needs each workspace to declare a package name.`,
      [
        {
          path: `${scope}.path`,
          message: `package.json at "${relPath}" missing "name"`,
        },
      ],
    );
  }
  return name;
}
