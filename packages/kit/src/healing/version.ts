// Singleton version-mismatch handling.
//
// Federation singletons (react, react-dom, app shared libs) must match
// between shell and MFE at runtime. When they don't, the strategy decides:
//   - "warn"   → console.warn, return verdict
//   - "throw"  → throw SingletonVersionError
//   - "ignore" → silent, return verdict

import type {
  HealingStrategy,
  VersionMismatchContext,
  VersionMismatchVerdict,
} from "@mfkit/plugin-api";

export class SingletonVersionError extends Error {
  override readonly name = "SingletonVersionError";
  readonly pkg: string;
  readonly expected: string;
  readonly actual: string;
  readonly entryName: string;
  constructor(ctx: VersionMismatchContext) {
    super(formatMessage(ctx));
    this.pkg = ctx.name;
    this.expected = ctx.expected;
    this.actual = ctx.actual;
    this.entryName = ctx.entry.name;
  }
}

export function checkSingletonVersion(
  strategy: HealingStrategy,
  ctx: VersionMismatchContext,
): VersionMismatchVerdict {
  const verdict = strategy.onVersionMismatch(ctx);
  if (verdict === "throw") throw new SingletonVersionError(ctx);
  if (verdict === "warn") {
    // eslint-disable-next-line no-console
    console.warn(`[mfkit] ${formatMessage(ctx)}`);
  }
  return verdict;
}

function formatMessage(ctx: VersionMismatchContext): string {
  return (
    `Singleton "${ctx.name}" version mismatch in "${ctx.entry.name}": ` +
    `expected ${ctx.expected}, got ${ctx.actual}`
  );
}
