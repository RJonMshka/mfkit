// Last-known-good manifest cache.
//
// Wraps a `fetcher` for a federation manifest (or any JSON document) with a
// stale fallback. On successful fetch the value is persisted to the storage;
// on failure the previously cached value is served and the result carries
// `stale: true` so the caller can surface a degraded-mode banner. If the
// fetch fails and no cached value exists, the original error propagates.
//
// Storage is pluggable. The built-in `memoryManifestStorage()` is enough for
// SSR and tests; consumers wire localStorage/IndexedDB at the boundary.

export interface ManifestStorage {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

export function memoryManifestStorage(): ManifestStorage {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
  };
}

export interface ManifestCacheOptions {
  readonly storage?: ManifestStorage;
}

export interface ManifestLoadResult<T> {
  readonly value: T;
  /** True when the live fetch failed and a cached value was served instead. */
  readonly stale: boolean;
  /** Original fetch error; only present when `stale` is true. */
  readonly error?: Error;
}

export interface ManifestCache<T> {
  load(key: string, fetcher: () => Promise<T>): Promise<ManifestLoadResult<T>>;
  invalidate(key: string): Promise<void>;
}

export function createManifestCache<T>(opts: ManifestCacheOptions = {}): ManifestCache<T> {
  const storage = opts.storage ?? memoryManifestStorage();

  return {
    async load(key, fetcher) {
      try {
        const value = await fetcher();
        try {
          await storage.set(key, JSON.stringify(value));
        } catch {
          // Persistence is best-effort: a full storage quota or a serializer
          // failure must not propagate as a manifest-load error.
        }
        return { value, stale: false };
      } catch (raw) {
        const error = raw instanceof Error ? raw : new Error(String(raw));
        const cached = await storage.get(key);
        if (cached == null) throw error;
        try {
          const value = JSON.parse(cached) as T;
          return { value, stale: true, error };
        } catch {
          throw error;
        }
      }
    },
    async invalidate(key) {
      await storage.remove(key);
    },
  };
}
