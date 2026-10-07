// L6 fault injection (docs/testing-and-evaluation.md): prove the headline
// feature. Each scenario breaks mfe_clock's remote at the network layer with
// Playwright request routing — no proxy server — in a fresh page, so the MF
// runtime and module map start clean every time. Requires `pnpm build` first.
//
// The forgiving default strategy is 3 attempts (200ms, 400ms backoff), then
// quarantine. Assertions read `data-mfkit-state`, which exists for this.
import { chromium } from "playwright-core";

import { startPreviewServers, waitFor } from "./preview-servers.mjs";

const CLOCK = "http://localhost:5176/";
const MAX_ATTEMPTS = 3; // forgivingStrategy() default
const outlet = (name, state) => `[data-mfkit-outlet="${name}"][data-mfkit-state="${state}"]`;

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch (err) {
  const msg = `Chrome not available for fault e2e (${err instanceof Error ? err.message.split("\n")[0] : err})`;
  if (process.env.CI) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`skipping: ${msg}`);
  process.exit(0);
}

/**
 * Open the shell with mfe_clock's origin wired through `fault(n)`, which gets
 * the 1-based request count for remoteEntry.js and returns an HTTP status to
 * fail with, or null to pass through.
 */
async function openWithFault(fault, { query = "", delayMs = 0, lifecycleBody } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const stats = { entryRequests: 0 };
  await page.route(`${CLOCK}**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    // Match on pathname: retries refetch with a `?mfkit-retry=N` cache-buster.
    if (pathname === "/remoteEntry.js") {
      stats.entryRequests += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const status = fault(stats.entryRequests);
      if (status !== null) return route.fulfill({ status, body: "injected fault" });
    }
    // Swap the exposed lifecycle chunk for a broken one (mount-time faults).
    if (lifecycleBody && /^\/assets\/lifecycle-[\w-]+\.js$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: lifecycleBody });
    }
    return route.continue();
  });
  await page.goto(`http://localhost:3000/${query}`, { waitUntil: "domcontentloaded" });
  return { page, stats, close: () => context.close() };
}

async function helloStillWorks(page) {
  await page.waitForSelector(outlet("mfe_hello", "mounted"), { timeout: 15_000 });
  const before = await page.textContent('[data-mfkit-mount="mfe_hello"] button');
  await page.click('[data-mfkit-mount="mfe_hello"] button');
  const after = await page.textContent('[data-mfkit-mount="mfe_hello"] button');
  if (before === after) throw new Error("mfe_hello stopped responding while mfe_clock was failing");
}

const scenarios = {
  // Remote is down for the whole session: the outlet must give up cleanly and
  // the rest of the shell must keep working.
  async "hard outage → quarantined, shell unaffected"() {
    const { page, stats, close } = await openWithFault(() => 503);
    try {
      await page.waitForSelector(outlet("mfe_clock", "quarantined"), { timeout: 15_000 });
      await helloStillWorks(page);
      // One real fetch per attempt. Before createFederationLoader, retries
      // replayed the MF runtime's cached rejection and this was 1 (review R8).
      if (stats.entryRequests !== MAX_ATTEMPTS) {
        throw new Error(
          `expected ${MAX_ATTEMPTS} fetches of remoteEntry.js, saw ${stats.entryRequests}`,
        );
      }
      return `quarantined after ${stats.entryRequests} request(s) for remoteEntry.js`;
    } finally {
      await close();
    }
  },

  // Remote fails twice, then recovers inside the retry budget: the outlet
  // must end up mounted without user action.
  async "transient outage → retries, then mounts"() {
    const { page, stats, close } = await openWithFault((n) => (n <= 2 ? 503 : null));
    try {
      await page.waitForSelector(outlet("mfe_clock", "mounted"), { timeout: 15_000 });
      await helloStillWorks(page);
      if (stats.entryRequests !== 3)
        throw new Error(`expected mount on fetch 3, saw ${stats.entryRequests}`);
      return `mounted on request ${stats.entryRequests}`;
    } finally {
      await close();
    }
  },

  // Remote is down until the user retries after it came back: "Try again"
  // must clear quarantine and actually re-fetch.
  async "recovery → Try again mounts once the remote is back"() {
    let healthy = false;
    const { page, stats, close } = await openWithFault(() => (healthy ? null : 503));
    try {
      await page.waitForSelector(outlet("mfe_clock", "quarantined"), { timeout: 15_000 });
      const failedRequests = stats.entryRequests;
      healthy = true;
      await page.click(`${outlet("mfe_clock", "quarantined")} button`);
      await page.waitForSelector(outlet("mfe_clock", "mounted"), { timeout: 15_000 });
      return `recovered (${failedRequests} failed, ${stats.entryRequests - failedRequests} after retry)`;
    } finally {
      await close();
    }
  },

  // A slow remote is not a failed one: the loading slot shows meanwhile and
  // the outlet doesn't fire extra requests while it waits.
  async "slow remote → loading slot, single request, then mounts"() {
    const { page, stats, close } = await openWithFault(() => null, { delayMs: 3_000 });
    try {
      await page.waitForSelector(outlet("mfe_clock", "loading"), { timeout: 2_000 });
      await helloStillWorks(page);
      await page.waitForSelector(outlet("mfe_clock", "mounted"), { timeout: 15_000 });
      if (stats.entryRequests !== 1)
        throw new Error(`expected 1 request, saw ${stats.entryRequests}`);
      return "loading slot shown during 3s latency";
    } finally {
      await close();
    }
  },

  // The remote loads but its mount() throws: the mount-error path must
  // quarantine with the real reason, not hang or blank the shell.
  async "mount throws → quarantined with the mount error"() {
    const { page, close } = await openWithFault(() => null, {
      lifecycleBody:
        'export default { mount() { throw new Error("injected mount failure"); }, unmount() {} };',
    });
    try {
      const slot = await page.waitForSelector(outlet("mfe_clock", "quarantined"), {
        timeout: 15_000,
      });
      const text = await slot.textContent();
      if (!text?.includes("injected mount failure")) throw new Error(`reason missing: ${text}`);
      await helloStillWorks(page);
      return "quarantined with the mount error as reason";
    } finally {
      await close();
    }
  },

  // Lockdown mode: strictStrategy fails fast — error slot, one request, no retries.
  async "strict strategy → error slot after exactly one request"() {
    const { page, stats, close } = await openWithFault(() => 503, {
      query: "?mfkit-strategy=strict",
    });
    try {
      await page.waitForSelector(outlet("mfe_clock", "error"), { timeout: 15_000 });
      await page.waitForTimeout(1_000); // would-be retries have had time to fire
      if (stats.entryRequests !== 1)
        throw new Error(`expected 1 request, saw ${stats.entryRequests}`);
      await helloStillWorks(page);
      return "error slot, 1 request";
    } finally {
      await close();
    }
  },
};

const servers = startPreviewServers();
let failed = false;
try {
  await waitFor("http://localhost:3000/");
  await waitFor(`${CLOCK}remoteEntry.js`);
  for (const [name, run] of Object.entries(scenarios)) {
    try {
      const detail = await run();
      console.log(`ok  ${name}  (${detail})`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${name}\n     ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(failed ? "fault e2e FAILED" : "fault e2e passed");
} finally {
  await servers.stop();
  await browser.close();
}
process.exit(failed ? 1 : 0);
