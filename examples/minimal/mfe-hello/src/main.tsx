// Standalone harness: every MFE also runs on its own dev server, outside any
// shell, with a synthetic MFEContext. Useful for developing one MFE in
// isolation.
import lifecycle from "./lifecycle";

const el = document.getElementById("root");
if (!el) throw new Error("#root missing in index.html");

void lifecycle.mount(el, {
  basePath: "/hello",
  mountId: "standalone",
  signal: new AbortController().signal,
});
