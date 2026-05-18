// Pure derivation: manifest → resolved values for one MFE / the shell.
//
// Zero Vite import here so the logic is unit-testable without any framework
// dependency installed. `vite.ts` consumes these and assembles UserConfig.

import type {
  AdapterMode,
  FrameworkAdapter,
  MFEManifestEntry,
  MFKitConfig,
  SharedDependencyMap,
  ShellConfig,
} from "@mfkit/plugin-api";

import { MFKitConfigError } from "../index.js";

const AUTO_PORT_MIN = 5173;
const AUTO_PORT_MAX = 5273;
const AUTO_PORT_COUNT = AUTO_PORT_MAX - AUTO_PORT_MIN + 1;
const DEFAULT_SHELL_PORT = 3000;
const DEFAULT_REMOTE_ENTRY = "remoteEntry.js";
const DEFAULT_EXPOSES: Readonly<Record<string, string>> = Object.freeze({
  "./lifecycle": "./src/lifecycle.ts",
});

export type InferenceSource =
  | "adapter-default"
  | "auto-assigned"
  | "kit-default"
  | "fallback-origin";

export interface InferredField {
  readonly scope: string;
  readonly field: string;
  readonly value: string;
  readonly source: InferenceSource;
}

export interface ResolvedMFE {
  readonly entry: MFEManifestEntry;
  readonly port: number;
  readonly exposes: Readonly<Record<string, string>>;
  readonly shared: SharedDependencyMap;
  readonly remoteEntryFile: string;
  readonly inferred: readonly InferredField[];
}

export interface ResolvedShell {
  readonly shell: ShellConfig;
  readonly port: number;
  readonly remotes: Readonly<Record<string, string>>;
  readonly shared: SharedDependencyMap;
  readonly inferred: readonly InferredField[];
}

export function findMFE(config: MFKitConfig, name: string): MFEManifestEntry {
  const found = config.mfes.find((m) => m.name === name);
  if (!found) {
    throw new MFKitConfigError(
      `No MFE named "${name}" in mfkit.config.ts. Known: ${config.mfes
        .map((m) => `"${m.name}"`)
        .join(", ") || "<none>"}`,
      [{ path: "mfes", message: `Unknown MFE name "${name}"` }],
    );
  }
  return found;
}

export function deriveMFE(
  config: MFKitConfig,
  entry: MFEManifestEntry,
  adapter: FrameworkAdapter,
): ResolvedMFE {
  const inferred: InferredField[] = [];

  const port = resolveMFEPort(config, entry, adapter, inferred);

  const exposes = entry.exposes ?? DEFAULT_EXPOSES;
  if (entry.exposes === undefined) {
    inferred.push({
      scope: entry.name,
      field: "exposes",
      value: JSON.stringify(DEFAULT_EXPOSES),
      source: "kit-default",
    });
  }

  const shared = composeShared(
    adapter.defaultShared,
    config.shared,
    entry.shared,
  );

  const remoteEntryFile = entry.remoteEntry ?? DEFAULT_REMOTE_ENTRY;
  if (entry.remoteEntry === undefined) {
    inferred.push({
      scope: entry.name,
      field: "remoteEntry",
      value: DEFAULT_REMOTE_ENTRY,
      source: "kit-default",
    });
  }

  return { entry, port, exposes, shared, remoteEntryFile, inferred };
}

export function deriveShell(
  config: MFKitConfig,
  adapter: FrameworkAdapter,
  opts: { readonly mode: AdapterMode },
): ResolvedShell {
  const inferred: InferredField[] = [];

  const port = config.shell.port ?? DEFAULT_SHELL_PORT;
  if (config.shell.port === undefined) {
    inferred.push({
      scope: "shell",
      field: "port",
      value: String(DEFAULT_SHELL_PORT),
      source: "kit-default",
    });
  }

  const remotes = buildRemotesMap(config, opts.mode, inferred);
  const shared = composeShared(
    adapter.defaultShared,
    config.shared,
    config.shell.shared,
  );

  return { shell: config.shell, port, remotes, shared, inferred };
}

export function buildRemotesMap(
  config: MFKitConfig,
  mode: AdapterMode,
  inferred?: InferredField[],
): Readonly<Record<string, string>> {
  const ports = autoAssignPorts(config);
  const out: Record<string, string> = {};
  for (const entry of config.mfes) {
    const port = entry.port ?? ports.get(entry.name);
    if (port === undefined) {
      throw new MFKitConfigError(
        `Internal: failed to resolve port for MFE "${entry.name}"`,
        [{ path: `mfes[${entry.name}].port`, message: "no port resolved" }],
      );
    }
    const file = entry.remoteEntry ?? DEFAULT_REMOTE_ENTRY;
    const origin =
      mode === "build" && entry.origin
        ? entry.origin
        : `http://localhost:${port}`;
    if (mode === "build" && !entry.origin && inferred) {
      inferred.push({
        scope: "shell",
        field: `remotes.${entry.name}`,
        value: origin,
        source: "fallback-origin",
      });
    }
    out[entry.name] = `${origin}/${file}`;
  }
  return out;
}

function resolveMFEPort(
  config: MFKitConfig,
  entry: MFEManifestEntry,
  adapter: FrameworkAdapter,
  inferred: InferredField[],
): number {
  if (entry.port !== undefined) return entry.port;

  if (adapter.defaultPort !== undefined) {
    const collides = collectExplicitPorts(config).has(adapter.defaultPort);
    if (!collides) {
      inferred.push({
        scope: entry.name,
        field: "port",
        value: String(adapter.defaultPort),
        source: "adapter-default",
      });
      return adapter.defaultPort;
    }
  }

  const ports = autoAssignPorts(config);
  const p = ports.get(entry.name);
  if (p === undefined) {
    throw new MFKitConfigError(
      `Could not auto-assign port for MFE "${entry.name}" (range ${AUTO_PORT_MIN}..${AUTO_PORT_MAX} exhausted)`,
      [{ path: `mfes[${entry.name}].port`, message: "auto-port exhausted" }],
    );
  }
  inferred.push({
    scope: entry.name,
    field: "port",
    value: String(p),
    source: "auto-assigned",
  });
  return p;
}

function collectExplicitPorts(config: MFKitConfig): Set<number> {
  const taken = new Set<number>();
  if (config.shell.port !== undefined) taken.add(config.shell.port);
  for (const m of config.mfes) {
    if (m.port !== undefined) taken.add(m.port);
  }
  return taken;
}

function autoAssignPorts(config: MFKitConfig): ReadonlyMap<string, number> {
  const taken = collectExplicitPorts(config);
  const assigned = new Map<string, number>();
  for (const m of config.mfes) {
    if (m.port !== undefined) continue;
    let p = AUTO_PORT_MIN + (hashName(m.name) % AUTO_PORT_COUNT);
    let probes = 0;
    while (taken.has(p) && probes < AUTO_PORT_COUNT) {
      p = AUTO_PORT_MIN + ((p - AUTO_PORT_MIN + 1) % AUTO_PORT_COUNT);
      probes++;
    }
    if (probes >= AUTO_PORT_COUNT) continue;
    taken.add(p);
    assigned.set(m.name, p);
  }
  return assigned;
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function composeShared(
  ...maps: readonly (SharedDependencyMap | undefined)[]
): SharedDependencyMap {
  const out: Record<string, SharedDependencyMap[string]> = {};
  for (const m of maps) {
    if (!m) continue;
    for (const key of Object.keys(m)) {
      const value = m[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}
