// Dev-mode visibility for inferred config.
//
// "Convention with smart inference, never enforcement" — when kit fills in a
// default the user didn't supply, that needs to be visible somewhere a
// developer will see it. One console block per process, only in dev.

import type { AdapterMode } from "@mfkit/plugin-api";

import type { InferredField } from "./derive.js";

const SHOWN = new Set<string>();

export function logInferred(
  scope: string,
  fields: readonly InferredField[],
  opts: { readonly mode: AdapterMode; readonly enabled: boolean },
): void {
  if (!opts.enabled) return;
  if (opts.mode !== "dev") return;
  if (fields.length === 0) return;
  if (SHOWN.has(scope)) return;
  SHOWN.add(scope);

  const lines = fields.map((f) => `  • ${f.field} = ${f.value}  (${f.source})`);
  // eslint-disable-next-line no-console
  console.info(`[mfkit] ${scope}: inferred defaults\n${lines.join("\n")}`);
}

/** Test-only: clears the once-per-process dedupe. */
export function _resetInferenceLog(): void {
  SHOWN.clear();
}
