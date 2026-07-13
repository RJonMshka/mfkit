// Standalone harness — run this MFE alone with a synthetic MFEContext.
import lifecycle from "./lifecycle";

const el = document.getElementById("root");
if (!el) throw new Error("#root missing in index.html");

void lifecycle.mount(el, {
  basePath: "/clock",
  mountId: "standalone",
  signal: new AbortController().signal,
});
