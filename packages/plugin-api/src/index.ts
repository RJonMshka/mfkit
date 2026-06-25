// @mfkit/plugin-api — the stable TypeScript contract surface for MFKit.
//
// Types only. Zero runtime side effects beyond the single exported constant
// `MFKIT_CONFIG_VERSION`. Surface is split by domain across modular files so
// each contract can evolve in isolation; this index re-exports the union.

export * from "./discovery.js";
export * from "./framework-adapter.js";
export * from "./healing.js";
export * from "./lifecycle.js";
export * from "./manifest.js";
export * from "./outlet.js";
export * from "./plugin.js";
export * from "./templates.js";
