// @mfkit/kit/types — federated remote type generation.
//
// The shell imports `<mfe-name>/lifecycle` at runtime via the MF runtime; TS
// needs a matching ambient declaration to typecheck those imports. This
// subpath generates those declarations from the same manifest that drives
// Vite + Turbo configs, so adding/removing an MFE is a single-source edit.
//
// Pure node. No bundler/UI imports. Tree-shakable in isolation — enforced
// by tests/vite/subpath-isolation.test.ts.
//
// Surface:
//   - generateRemoteTypes(config)            pure manifest → .d.ts string
//   - writeRemoteTypes(config, opts)         persist to disk (idempotent)
//   - watchRemoteTypes(config, opts)         fs.watch wrapper around write
//   - DEFAULT_REMOTE_TYPES_PATH              ".mfkit/generated/remotes.d.ts"

export {
  type GenerateRemoteTypesOptions,
  generateRemoteTypes,
} from "./types/generate.js";
export {
  type RemoteTypesWatcher,
  type WatchRemoteTypesOptions,
  watchRemoteTypes,
} from "./types/watch.js";
export {
  DEFAULT_REMOTE_TYPES_PATH,
  type WriteRemoteTypesOptions,
  type WriteRemoteTypesResult,
  writeRemoteTypes,
} from "./types/write.js";
