# @mfkit/plugin-api

The stable TypeScript contract surface for MFKit.

**Types only. Zero runtime. Side-effect-free.**

This package locks the public API surface. Every other `@mfkit/*` package
implements these types; plugin authors target them. Breaking changes here
require a major bump and a codemod.

Status: alpha (Phase 1, Step 1 fills the surface).
