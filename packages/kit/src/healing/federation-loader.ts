// A `loadRemote` whose retries actually retry (review finding R8).
//
// The MF runtime memoizes each remote entry load per (name, entry URL) in
// `globalLoading` — rejected promises included — and the browser's module map
// does the same for a failed ESM import of a URL. So the outlet's retry loop
// called `loadRemote` again and got the *same* rejection back without a single
// network request: retry/backoff was a no-op and an MFE that blipped once was
// down until a full page reload.
//
// After a remote fails, the next load re-registers it (`force: true`) under a
// cache-busted entry URL (`?mfkit-retry=N`). A new URL is a new `globalLoading`
// key *and* a new module-map entry, so the retry really fetches again.
//
// Kit still doesn't import the MF runtime (design decision #9). The shell
// passes it in: `createFederationLoader(await import("@module-federation/runtime"))`
// or the named functions. Pure aside from what the injected runtime does.

/** One registered remote, as the MF runtime reports it. */
export interface FederationRemoteLike {
  readonly name: string;
  readonly entry?: string;
}

/**
 * The slice of `@module-federation/runtime` the loader needs. Method syntax on
 * purpose: it keeps the real runtime's (generic, wider) signatures assignable.
 */
export interface FederationRuntimeLike {
  loadRemote(id: string): Promise<unknown>;
  registerRemotes(remotes: FederationRemoteLike[], options?: { force?: boolean }): void;
  getInstance(): { readonly options: { readonly remotes: readonly FederationRemoteLike[] } } | null;
}

export const RETRY_PARAM = "mfkit-retry";

/**
 * Wrap the MF runtime's `loadRemote` so a load that follows a failure of the
 * same remote re-fetches its entry instead of replaying the cached failure.
 * Hand the result to `<MFKitProvider loadRemote={…}>`.
 */
export function createFederationLoader(
  runtime: FederationRuntimeLike,
): (id: string) => Promise<unknown> {
  const failures = new Map<string, number>();

  return async (id) => {
    const name = remoteNameOf(id);
    const failed = failures.get(name);
    if (failed !== undefined) bustEntry(runtime, name, failed);

    let mod: unknown;
    try {
      mod = await runtime.loadRemote(id);
    } catch (err) {
      failures.set(name, (failed ?? 0) + 1);
      throw err;
    }
    // The runtime resolves `null` when an errorLoadRemote hook swallowed the
    // failure. That is still a failed load — and must bust the cache next time.
    if (mod == null) {
      failures.set(name, (failed ?? 0) + 1);
      throw new Error(`loadRemote("${id}") resolved to ${String(mod)}`);
    }
    failures.delete(name);
    return mod;
  };
}

function remoteNameOf(id: string): string {
  // Scoped remote names ("@org/remote/module") keep their first two segments.
  const parts = id.split("/");
  return id.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? id);
}

function bustEntry(runtime: FederationRuntimeLike, name: string, attempt: number): void {
  const remote = runtime.getInstance()?.options.remotes.find((r) => r.name === name);
  if (!remote?.entry) return;
  runtime.registerRemotes([{ ...remote, entry: withRetryParam(remote.entry, attempt) }], {
    force: true,
  });
}

/** Replace (not stack) the retry marker, keeping any other query params. */
export function withRetryParam(entry: string, attempt: number): string {
  const [base = "", query = ""] = entry.split("?", 2) as [string, string?];
  const kept = query.split("&").filter((p) => p !== "" && !p.startsWith(`${RETRY_PARAM}=`));
  kept.push(`${RETRY_PARAM}=${attempt}`);
  return `${base}?${kept.join("&")}`;
}
