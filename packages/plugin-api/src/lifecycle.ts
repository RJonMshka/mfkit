/**
 * MFE lifecycle contract — the one shape every MFE exposes.
 *
 * MFKit injects an `MFEContext` separate from user-defined `props`. Context
 * is MFKit's channel (route, mount ID, abort signal); props are arbitrary
 * payload supplied by the host. Keeping them distinct lets MFKit add context
 * fields without breaking host/MFE prop schemas.
 */

/**
 * MFKit-injected context, passed to `mount` on every mount.
 *
 * Implementations should:
 *   - Use `basePath` for client-side routing inside the MFE.
 *   - Honor `signal` — if it aborts during async setup, mount should resolve
 *     without rendering.
 */
export interface MFEContext {
  /** URL segment the MFE is mounted under, e.g. `"/metrics"`. */
  readonly basePath: string;
  /** Unique ID per mount instance — useful for keying per-mount state. */
  readonly mountId: string;
  /** Aborts when the host unmounts the MFE before `mount` resolves. */
  readonly signal: AbortSignal;
}

/**
 * The contract every MFE exposes as its default export from `lifecycle.ts`.
 *
 * `Props` is generic so MFEs can declare strongly-typed payloads; the default
 * `unknown` enforces a guard at the boundary when consumers don't specify.
 *
 * Both `mount` and `unmount` may be sync or async. The host awaits both.
 */
export interface MFEDefinition<Props = unknown> {
  readonly mount: (el: HTMLElement, ctx: MFEContext, props?: Props) => Promise<void> | void;
  readonly unmount: (el: HTMLElement) => Promise<void> | void;
}

/**
 * Backwards-compatible alias preserving the original `MFELifecycle` name used
 * across the design docs and DevNexus. Treated as identical to `MFEDefinition`.
 */
export type MFELifecycle<Props = unknown> = MFEDefinition<Props>;
