import { MFKitOutlet, MFKitProvider } from "@mfkit/kit/react";

import config from "../../mfkit.config";

// The kit never hard-depends on a Module Federation runtime — the shell owns
// the loader. Federated ids ("<remote>/<module>") map to static import()
// calls that @module-federation/vite rewrites at build time. The generated
// `.mfkit/generated/remotes.d.ts` (from `pnpm gen`) types both modules.
const remoteModules: Readonly<Record<string, () => Promise<unknown>>> = {
  "mfe_hello/lifecycle": () => import("mfe_hello/lifecycle"),
  "mfe_clock/lifecycle": () => import("mfe_clock/lifecycle"),
};

function loadRemote(id: string): Promise<unknown> {
  const load = remoteModules[id];
  if (!load) {
    return Promise.reject(new Error(`Shell has no loader for remote module "${id}"`));
  }
  return load();
}

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
