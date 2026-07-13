// Build-time CSS injection for federated remotes.
//
// The problem (dx-findings #4): a built MFE extracts its styles into a .css
// asset that only the remote's own index.html references. A federated consumer
// loads `remoteEntry.js` — never that HTML — so every remote renders unstyled
// in the shell while looking perfect when the MFE runs standalone. Svelte
// <style> blocks, Vue SFC styles, and plain `import "./x.css"` in React all hit
// it.
//
// Dev is unaffected: Vite serves styles through JS modules with HMR, so the
// remote's styles arrive over the module graph. This is a build-only concern.
//
// The fix: fold the emitted CSS back into the entry chunks as a self-executing
// <style> injection, and drop the now-orphaned asset. Consumers get styles the
// moment they load the remote.

import type { Plugin, Rollup } from "vite";

export interface CssInjectOptions {
  /** Distinguishes this remote's <style> tag from other remotes' on the host page. */
  readonly remoteName: string;
}

export function cssInjectedByJs(opts: CssInjectOptions): Plugin {
  return {
    name: "mfkit:css-injected-by-js",
    apply: "build",
    // After the bundler has emitted CSS assets, before anything writes them out.
    enforce: "post",

    generateBundle(_options, bundle: Rollup.OutputBundle) {
      const cssFiles = Object.entries(bundle).filter(
        (pair): pair is [string, Rollup.OutputAsset] =>
          pair[1].type === "asset" && pair[0].endsWith(".css"),
      );
      if (cssFiles.length === 0) return;

      const css = cssFiles
        .map(([, asset]) =>
          typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source),
        )
        .join("\n")
        .trim();

      // Entry chunks are what a federated consumer actually loads (remoteEntry
      // among them). Injecting into every entry — rather than guessing which
      // one — is why the snippet is idempotent.
      const entryChunks = Object.values(bundle).filter(
        (chunk): chunk is Rollup.OutputChunk => chunk.type === "chunk" && chunk.isEntry,
      );
      if (entryChunks.length === 0 || css.length === 0) return;

      const snippet = injectionSnippet(opts.remoteName, css);
      for (const chunk of entryChunks) {
        chunk.code = `${snippet}\n${chunk.code}`;
      }

      // The asset is dead weight now — and leaving it would let a stale
      // index.html <link> double-apply the styles.
      for (const [file] of cssFiles) {
        delete bundle[file];
      }
    },
  };
}

// Self-executing, idempotent, and non-throwing: an MFE whose styles fail to
// attach should still mount (invariant 5 — forgiving by default). Guarded on
// `document` so SSR/node consumers importing the chunk don't explode.
function injectionSnippet(remoteName: string, css: string): string {
  const id = `mfkit-css-${remoteName}`;
  return [
    "(function(){try{",
    'if(typeof document==="undefined")return;',
    `var id=${JSON.stringify(id)};`,
    "if(document.getElementById(id))return;",
    'var el=document.createElement("style");',
    "el.id=id;",
    `el.textContent=${JSON.stringify(css)};`,
    "document.head.appendChild(el);",
    // JSON.stringify, not interpolation: the remote name lands inside generated
    // JS source, and a name containing a quote would otherwise break the chunk.
    `}catch(e){console.error("[mfkit] failed to inject styles for "+${JSON.stringify(remoteName)},e);}})();`,
  ].join("");
}
