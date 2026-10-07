import { createFederationLoader } from "@mfkit/kit/healing";
import { MFKitOutlet, MFKitProvider } from "@mfkit/kit/react";
import * as federationRuntime from "@module-federation/runtime";

import config from "../../mfkit.config";

// The kit never hard-depends on a Module Federation runtime — the shell owns
// the loader and hands it to the provider.
//
// Use the runtime's `loadRemote(id)`, NOT static `import("mfe_x/lifecycle")`
// specifiers. @module-federation/vite collects every remote the host imports
// by specifier and preloads them all in its bootstrap with `Promise.all`
// before starting the app: one remote down → blank shell, and the outlet's
// healing never gets a chance to run (review finding R7). Runtime-loaded
// remotes are fetched only when an outlet asks, so failures route through the
// HealingStrategy like they're supposed to.
//
// `createFederationLoader` wraps the runtime so a retry after a failure really
// refetches: the MF runtime caches rejected remote-entry loads, which made
// retry/backoff a no-op (review finding R8).
//
// Federated module types still come from `.mfkit/generated/remotes.d.ts`;
// `loadRemote` returns `unknown` here and the outlet validates the shape.
const loadRemote = createFederationLoader(federationRuntime);

const sectionStyle = { marginTop: "2rem" } as const;

export function App() {
  return (
    <MFKitProvider loadRemote={loadRemote} entries={config.mfes}>
      <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto" }}>
        <h1>{config.name} — MFKit shell</h1>
        <p>
          Two federated MFEs, one manifest. React and Svelte, each mounted through{" "}
          <code>&lt;MFKitOutlet&gt;</code> with the default forgiving healing strategy.
        </p>

        <section style={sectionStyle}>
          <h2>mfe_hello — React</h2>
          <MFKitOutlet remote="mfe_hello" props={{ greeting: "Hello from the shell" }} />
        </section>

        <section style={sectionStyle}>
          <h2>mfe_clock — Svelte</h2>
          {/* Custom error slot: swap the default failure UI without touching the kit. */}
          <MFKitOutlet
            remote="mfe_clock"
            errorFallback={({ entry, error, retry }) => (
              <div role="alert">
                <p>
                  {entry.label ?? entry.name} failed to load: {error.message}
                </p>
                <button type="button" onClick={retry}>
                  Try again
                </button>
              </div>
            )}
          />
        </section>
      </main>
    </MFKitProvider>
  );
}
