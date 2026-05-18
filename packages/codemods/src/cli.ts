#!/usr/bin/env node
// mfkit-migrate CLI — Phase 1 (Step 10) stub. End-to-end subcommand routing
// is wired so the binary is shape-complete; with zero registered codemods,
// every command is a no-op that reports "nothing to do". Real upgrade flows
// hang off the same surface when codemods land in v0.3+.

import {
  CodemodRegistryError,
  listCodemods,
  planMigration,
  type CodemodManifest,
  type MigrationContext,
  type MigrationLogger,
  type MigrationResult,
} from "./registry.js";

export interface CliIO {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly cwd: string;
}

const HELP_TEXT = `mfkit-migrate — upgrade tooling for MFKit projects.

Usage:
  mfkit-migrate <command> [options]

Commands:
  list                          List every registered codemod.
  plan --from <n> --to <n>      Show the codemods that would run for that step range.
  up   --from <n> --to <n>      Run those codemods. Use --dry-run to preview without writing.
  help, --help, -h              Print this message.

Notes:
  Phase 1 ships the registry + CLI skeleton with zero codemods registered.
  Every command exits successfully with "nothing to do" until v0.3+ migrations land.
`;

/**
 * Pure CLI entry. Returns the process exit code; the binary at the bottom of
 * this file forwards it to `process.exit`. Tests invoke `main` directly with
 * a capturing `CliIO`.
 */
export async function main(
  argv: readonly string[],
  io: CliIO = defaultIO(),
): Promise<number> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      io.stdout(HELP_TEXT);
      return 0;
    case "list":
      return runList(io);
    case "plan":
      return runPlan(rest, io);
    case "up":
      return runUp(rest, io);
    default:
      io.stderr(`mfkit-migrate: unknown command "${cmd}"\n`);
      io.stderr(HELP_TEXT);
      return 2;
  }
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function runList(io: CliIO): number {
  const codemods = listCodemods();
  if (codemods.length === 0) {
    io.stdout("No codemods registered.\n");
    return 0;
  }
  io.stdout(`Registered codemods (${codemods.length}):\n`);
  for (const c of codemods) {
    io.stdout(
      `  • ${c.id}  v${c.fromVersion} → v${c.toVersion}  — ${c.description}\n`,
    );
  }
  return 0;
}

function runPlan(args: readonly string[], io: CliIO): number {
  const parsed = parseRange(args);
  if (parsed.kind === "error") {
    io.stderr(`mfkit-migrate plan: ${parsed.message}\n`);
    return 2;
  }
  const { from, to } = parsed;

  let plan: readonly CodemodManifest[];
  try {
    plan = planMigration(from, to);
  } catch (err) {
    return reportPlanError(err, io);
  }

  if (plan.length === 0) {
    io.stdout(`Nothing to do (already at v${to}).\n`);
    return 0;
  }
  io.stdout(`Plan v${from} → v${to} (${plan.length} step${plan.length === 1 ? "" : "s"}):\n`);
  for (const c of plan) {
    io.stdout(
      `  ${c.fromVersion} → ${c.toVersion}  ${c.id}  — ${c.description}\n`,
    );
  }
  return 0;
}

async function runUp(args: readonly string[], io: CliIO): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const range = parseRange(args.filter((a) => a !== "--dry-run"));
  if (range.kind === "error") {
    io.stderr(`mfkit-migrate up: ${range.message}\n`);
    return 2;
  }
  const { from, to } = range;

  let plan: readonly CodemodManifest[];
  try {
    plan = planMigration(from, to);
  } catch (err) {
    return reportPlanError(err, io);
  }

  if (plan.length === 0) {
    io.stdout(`Nothing to do (already at v${to}).\n`);
    return 0;
  }

  const logger = consoleLoggerFor(io);
  const ctx: MigrationContext = { cwd: io.cwd, dryRun, logger };

  io.stdout(
    `${dryRun ? "Dry run — " : ""}Applying ${plan.length} codemod${plan.length === 1 ? "" : "s"} (v${from} → v${to}):\n`,
  );

  for (const c of plan) {
    io.stdout(`  ▸ ${c.id} (v${c.fromVersion} → v${c.toVersion})…\n`);
    try {
      const result = await c.apply(ctx);
      reportResult(result, io);
    } catch (err) {
      io.stderr(
        `mfkit-migrate up: codemod "${c.id}" failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  }

  io.stdout(`${dryRun ? "Dry run complete." : "Done."}\n`);
  return 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ParsedRange =
  | { kind: "ok"; from: number; to: number }
  | { kind: "error"; message: string };

function parseRange(args: readonly string[]): ParsedRange {
  const from = parseFlag(args, "--from");
  const to = parseFlag(args, "--to");
  if (from === undefined || to === undefined) {
    return {
      kind: "error",
      message: "both --from <n> and --to <n> are required.",
    };
  }
  const fromN = Number(from);
  const toN = Number(to);
  if (!Number.isInteger(fromN) || !Number.isInteger(toN)) {
    return {
      kind: "error",
      message: `--from and --to must be integers (got --from=${from}, --to=${to}).`,
    };
  }
  return { kind: "ok", from: fromN, to: toN };
}

function parseFlag(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}

function reportPlanError(err: unknown, io: CliIO): number {
  if (err instanceof CodemodRegistryError) {
    io.stderr(`${err.message}\n`);
    return 1;
  }
  io.stderr(
    `mfkit-migrate: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  return 1;
}

function reportResult(result: MigrationResult, io: CliIO): void {
  if (result.filesChanged.length === 0) {
    io.stdout("    (no files changed)\n");
  } else {
    for (const f of result.filesChanged) io.stdout(`    ~ ${f}\n`);
  }
  if (result.notes) {
    for (const n of result.notes) io.stdout(`    note: ${n}\n`);
  }
}

function consoleLoggerFor(io: CliIO): MigrationLogger {
  return {
    info: (m) => io.stdout(`    ${m}\n`),
    warn: (m) => io.stderr(`    warn: ${m}\n`),
    error: (m) => io.stderr(`    error: ${m}\n`),
  };
}

function defaultIO(): CliIO {
  return {
    stdout: (line) => process.stdout.write(line),
    stderr: (line) => process.stderr.write(line),
    cwd: process.cwd(),
  };
}

// ─── Entry ───────────────────────────────────────────────────────────────────
// `process.argv[1]` is the script path; we only auto-execute when this file is
// invoked directly (not when imported in tests).

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
