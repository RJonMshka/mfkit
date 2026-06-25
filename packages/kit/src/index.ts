// @mfkit/kit — runtime entry.
//
// Phase 1 Step 2: defineConfig + defineMFE land as validated passthroughs.
// Vite generation (Step 4), React outlet (Step 6), and healing primitives
// (Step 7) live in subpath entries (./vite, ./react, ./healing).

import { type MFEDefinition, MFKIT_CONFIG_VERSION, type MFKitConfig } from "@mfkit/plugin-api";
import * as v from "valibot";

// Re-export the entire plugin-api surface so consumers can import everything
// from @mfkit/kit. The kit's public API is the contract + the runtime helpers.
export * from "@mfkit/plugin-api";

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface MFKitConfigIssue {
  /** Dot-path to the offending field, e.g. "mfes[0].port". */
  readonly path: string;
  readonly message: string;
}

export class MFKitConfigError extends Error {
  override readonly name = "MFKitConfigError";
  readonly issues: readonly MFKitConfigIssue[];

  constructor(message: string, issues: readonly MFKitConfigIssue[] = []) {
    super(message);
    this.issues = issues;
  }
}

// ─── Valibot schemas ─────────────────────────────────────────────────────────
// Schemas mirror @mfkit/plugin-api's TS contract. The TS types stay
// authoritative — schemas are runtime guards. `looseObject` lets unknown
// keys pass so forward-compatible additions don't silently get dropped.

const JS_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/u;
const PORT_MIN = 1024;
const PORT_MAX = 65535;

const portSchema = v.pipe(
  v.number("port must be a number"),
  v.integer("port must be an integer"),
  v.minValue(PORT_MIN, `port must be >= ${PORT_MIN}`),
  v.maxValue(PORT_MAX, `port must be <= ${PORT_MAX}`),
);

const sharedDepSchema = v.looseObject({
  singleton: v.optional(v.boolean()),
  strictVersion: v.optional(v.boolean()),
  requiredVersion: v.optional(v.string()),
  eager: v.optional(v.boolean()),
});

const sharedMapSchema = v.record(v.string(), sharedDepSchema);

const mfeEntrySchema = v.looseObject({
  name: v.pipe(
    v.string("name must be a string"),
    v.minLength(1, "name cannot be empty"),
    v.regex(JS_IDENTIFIER, "name must be a valid JS identifier (e.g. mfe_metrics)"),
  ),
  route: v.pipe(v.string("route must be a string"), v.startsWith("/", "route must start with '/'")),
  framework: v.pipe(v.string("framework must be a string"), v.minLength(1)),
  path: v.pipe(v.string("path must be a string"), v.minLength(1, "path cannot be empty")),
  port: v.optional(portSchema),
  origin: v.optional(v.string()),
  remoteEntry: v.optional(v.string()),
  exposes: v.optional(v.record(v.string(), v.string())),
  shared: v.optional(sharedMapSchema),
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  budgetBytes: v.optional(v.pipe(v.number(), v.minValue(0, "budgetBytes must be >= 0"))),
});

const shellSchema = v.looseObject({
  name: v.pipe(
    v.string(),
    v.minLength(1, "shell.name cannot be empty"),
    v.regex(JS_IDENTIFIER, "shell name must be a valid JS identifier"),
  ),
  framework: v.pipe(v.string(), v.minLength(1)),
  path: v.pipe(v.string(), v.minLength(1, "shell.path cannot be empty")),
  port: v.optional(portSchema),
  origin: v.optional(v.string()),
  budgetBytes: v.optional(v.pipe(v.number(), v.minValue(0))),
  shared: v.optional(sharedMapSchema),
});

const mfkitConfigSchema = v.looseObject({
  version: v.literal(MFKIT_CONFIG_VERSION, `version must equal ${MFKIT_CONFIG_VERSION}`),
  name: v.pipe(v.string(), v.minLength(1, "name cannot be empty")),
  shell: shellSchema,
  mfes: v.array(mfeEntrySchema),
  shared: v.optional(sharedMapSchema),
  budgets: v.optional(v.record(v.string(), v.number())),
  // healing/discovery/plugins are validated by their consumers (Step 7+),
  // not at the config boundary — their function shapes resist meaningful
  // structural validation here.
  healing: v.optional(v.unknown()),
  discovery: v.optional(v.unknown()),
  plugins: v.optional(v.array(v.unknown())),
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Author the top-level MFKit manifest. Validates the shape and cross-field
 * invariants (uniqueness of MFE name/port/route) at call time and returns
 * the input unchanged on success — `toBe` reference-equality holds.
 *
 * Aggregates every issue into one MFKitConfigError so users see all problems
 * at once instead of fixing one and discovering the next.
 */
export function defineConfig(config: MFKitConfig): MFKitConfig {
  const issues: MFKitConfigIssue[] = [];

  const parsed = v.safeParse(mfkitConfigSchema, config);
  if (!parsed.success) {
    for (const issue of parsed.issues) {
      issues.push({
        path: formatPath(issue.path),
        message: issue.message,
      });
    }
  }

  if (config && typeof config === "object" && Array.isArray(config.mfes)) {
    issues.push(...crossCheck(config));
  }

  if (issues.length > 0) {
    throw new MFKitConfigError(formatErrorMessage(issues), issues);
  }

  return config;
}

/**
 * Stamp an MFE's runtime lifecycle with the MFKit contract. Phase 1 is a
 * typed passthrough plus shape validation — Step 5 wires every MFE through
 * this so the kit can intercept mount/unmount for healing telemetry without
 * changing behavior.
 */
export function defineMFE<Props = unknown>(def: MFEDefinition<Props>): MFEDefinition<Props> {
  if (def === null || typeof def !== "object") {
    throw new MFKitConfigError(
      "defineMFE: lifecycle must be an object with mount/unmount functions",
      [{ path: "<root>", message: "lifecycle must be an object" }],
    );
  }
  if (typeof def.mount !== "function") {
    throw new MFKitConfigError("defineMFE: mount must be a function", [
      { path: "mount", message: "mount must be a function" },
    ]);
  }
  if (typeof def.unmount !== "function") {
    throw new MFKitConfigError("defineMFE: unmount must be a function", [
      { path: "unmount", message: "unmount must be a function" },
    ]);
  }
  return def;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function crossCheck(config: MFKitConfig): MFKitConfigIssue[] {
  const issues: MFKitConfigIssue[] = [];
  const seenName = new Map<string, number>();
  const seenPort = new Map<number, number>();
  const seenRoute = new Map<string, number>();

  config.mfes.forEach((mfe, i) => {
    if (!mfe || typeof mfe !== "object") return;

    if (typeof mfe.name === "string") {
      const prev = seenName.get(mfe.name);
      if (prev !== undefined) {
        const prevName = config.mfes[prev]?.name ?? "<earlier entry>";
        issues.push({
          path: `mfes[${i}].name`,
          message: `Duplicate MFE name: "${mfe.name}" (also at mfes[${prev}].name = "${prevName}")`,
        });
      } else {
        seenName.set(mfe.name, i);
      }
    }

    if (typeof mfe.port === "number") {
      const prev = seenPort.get(mfe.port);
      if (prev !== undefined) {
        const prevName = config.mfes[prev]?.name ?? "<earlier entry>";
        issues.push({
          path: `mfes[${i}].port`,
          message: `Port ${mfe.port} used by both "${prevName}" and "${mfe.name}"`,
        });
      } else {
        seenPort.set(mfe.port, i);
      }
    }

    if (typeof mfe.route === "string") {
      const prev = seenRoute.get(mfe.route);
      if (prev !== undefined) {
        const prevName = config.mfes[prev]?.name ?? "<earlier entry>";
        issues.push({
          path: `mfes[${i}].route`,
          message: `Route "${mfe.route}" used by both "${prevName}" and "${mfe.name}"`,
        });
      } else {
        seenRoute.set(mfe.route, i);
      }
    }
  });

  return issues;
}

function formatPath(path: v.BaseIssue<unknown>["path"]): string {
  if (!path || path.length === 0) return "<root>";
  return path
    .map((segment, idx) => {
      const key = (segment as { key?: unknown }).key;
      if (typeof key === "number") return `[${key}]`;
      if (idx === 0) return String(key);
      return `.${String(key)}`;
    })
    .join("");
}

function formatErrorMessage(issues: readonly MFKitConfigIssue[]): string {
  const lines = issues.map((i) => `  • ${i.path}: ${i.message}`);
  return `Invalid MFKit config (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n${lines.join("\n")}`;
}
