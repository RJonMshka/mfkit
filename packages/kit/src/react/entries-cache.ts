// Identity-stable manifest-entry map.
//
// `<MFKitProvider entries={[...]} />` is the natural thing for a consumer to
// write, and an inline array literal is a new object every render. Keying the
// derived map on identity meant the context value changed on every render of
// any ancestor, which remounted every outlet under it — MFEs tearing down and
// re-mounting because a parent re-rendered (dx-findings #7).
//
// Keying on *content* instead makes the map stable for structurally-equal
// input. Kept outside the component (and out of React) so it can be tested
// without a renderer, like the outlet controller.

import type { MFEManifestEntry } from "@mfkit/plugin-api";

export type EntriesResolver = (
  entries: readonly MFEManifestEntry[] | undefined,
) => ReadonlyMap<string, MFEManifestEntry>;

/**
 * Build a resolver that returns the *same* map instance as long as the entries
 * are structurally unchanged. One cache per provider instance.
 */
export function createEntriesCache(): EntriesResolver {
  let cached: { key: string; map: ReadonlyMap<string, MFEManifestEntry> } | null = null;

  return (entries) => {
    // Manifests are small and flat, so stringify is a cheap, dependency-free
    // structural key. It is order-sensitive — reordering entries yields a new
    // map, which is correct-but-conservative and never wrong.
    const key = JSON.stringify(entries ?? []);
    if (cached !== null && cached.key === key) return cached.map;

    const map = new Map<string, MFEManifestEntry>();
    for (const e of entries ?? []) map.set(e.name, e);
    cached = { key, map };
    return map;
  };
}
