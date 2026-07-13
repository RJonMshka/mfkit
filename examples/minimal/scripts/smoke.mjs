// HTTP smoke test for the built example. Requires `pnpm build` first.
// Asserts each MFE serves remoteEntry.js naming its "lifecycle" expose and
// the shell serves its index.html. For real mount verification in a browser,
// see e2e.mjs.
import { apps, startPreviewServers, waitFor } from "./preview-servers.mjs";

let servers;
let failed = false;
try {
  servers = startPreviewServers();
  for (const app of apps) {
    const url = `http://localhost:${app.port}${app.path}`;
    const body = await waitFor(url);
    if (!body.includes(app.expect)) {
      throw new Error(`${url} responded but body does not contain ${JSON.stringify(app.expect)}`);
    }
    console.log(`ok  ${url}`);
  }
  console.log("smoke test passed");
} catch (err) {
  console.error(`smoke test failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
} finally {
  await servers?.stop();
}
process.exit(failed ? 1 : 0);
