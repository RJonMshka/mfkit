// Browser end-to-end test: load the shell in headless Chrome and assert both
// federated MFEs actually mount and behave. Requires `pnpm build` first.
//
// Uses playwright-core with the system Chrome (channel: "chrome") — no
// browser download. GitHub's ubuntu runners ship Chrome; locally the test
// skips with a warning when Chrome is missing (fails instead when CI=true).
import { chromium } from "playwright-core";

import { startPreviewServers, waitFor } from "./preview-servers.mjs";

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch (err) {
  const msg = `Chrome not available for e2e (${err instanceof Error ? err.message.split("\n")[0] : err})`;
  if (process.env.CI) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`skipping: ${msg}`);
  process.exit(0);
}

const servers = startPreviewServers();
let failed = false;
try {
  await waitFor("http://localhost:3000/");

  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

  // Both outlets reach the "mounted" healing state.
  for (const name of ["mfe_hello", "mfe_clock"]) {
    await page.waitForSelector(`[data-mfkit-outlet="${name}"][data-mfkit-state="mounted"]`, {
      timeout: 15_000,
    });
    console.log(`ok  ${name} mounted`);
  }

  // The React MFE received shell props + MFEContext and is interactive.
  const helloText = await page.textContent('[data-mfkit-mount="mfe_hello"]');
  if (!helloText?.includes("Hello from the shell") || !helloText.includes("/hello")) {
    throw new Error(`mfe_hello content wrong: ${JSON.stringify(helloText)}`);
  }
  await page.click('[data-mfkit-mount="mfe_hello"] button');
  const afterClick = await page.textContent('[data-mfkit-mount="mfe_hello"] button');
  if (!afterClick?.includes("1")) {
    throw new Error(`mfe_hello counter did not increment: ${JSON.stringify(afterClick)}`);
  }
  console.log("ok  mfe_hello props + interactivity");

  // The Svelte MFE received its MFEContext and its interval is live.
  const clockText = await page.textContent('[data-mfkit-mount="mfe_clock"]');
  if (!clockText?.includes("/clock")) {
    throw new Error(`mfe_clock did not receive basePath: ${JSON.stringify(clockText)}`);
  }
  const t1 = await page.textContent('[data-mfkit-mount="mfe_clock"] time');
  await page.waitForTimeout(2_100);
  const t2 = await page.textContent('[data-mfkit-mount="mfe_clock"] time');
  if (t1 === t2) throw new Error(`mfe_clock is not ticking (stuck at ${t1})`);
  console.log("ok  mfe_clock ticking");

  if (pageErrors.length > 0) {
    throw new Error(`page errors:\n  ${pageErrors.join("\n  ")}`);
  }
  console.log("e2e passed");
} catch (err) {
  console.error(`e2e failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
} finally {
  await servers.stop();
  await browser.close();
}
process.exit(failed ? 1 : 0);
