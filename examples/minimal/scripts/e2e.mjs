// Browser end-to-end test: load the shell in headless Chrome and assert both
// federated MFEs actually mount and behave. Requires `pnpm build` first.
//
// Uses playwright-core with the system Chrome (channel: "chrome") — no
// browser download. GitHub's ubuntu runners ship Chrome; locally the test
// skips with a warning when Chrome is missing (fails instead when CI=true).

import { createServer } from "node:http";
import { chromium } from "playwright-core";

import { startPreviewServers, waitFor } from "./preview-servers.mjs";

/** Proxy the shell on :3100, adding a strict style CSP and the nonce meta tag. */
function startCspProxy(nonce) {
  const server = createServer(async (req, res) => {
    const upstream = await fetch(`http://localhost:3000${req.url}`);
    const headers = Object.fromEntries(upstream.headers);
    delete headers["content-encoding"];
    delete headers["content-length"];
    let body = Buffer.from(await upstream.arrayBuffer());
    if ((headers["content-type"] ?? "").includes("text/html")) {
      headers["content-security-policy"] = `style-src 'nonce-${nonce}'`;
      body = Buffer.from(
        body
          .toString("utf8")
          .replace("<head>", `<head><meta property="csp-nonce" nonce="${nonce}">`),
      );
    }
    res.writeHead(upstream.status, headers).end(body);
  });
  return new Promise((resolve) =>
    server.listen(3100, () =>
      resolve({ url: "http://localhost:3100/", close: () => new Promise((r) => server.close(r)) }),
    ),
  );
}

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

// `--dev` runs the same assertions against Vite dev servers instead of
// production builds (testing plan L5). Build-only checks are skipped there.
const devMode = process.argv.includes("--dev");
const servers = startPreviewServers({ mode: devMode ? "dev" : "preview" });
let failed = false;
try {
  await waitFor("http://localhost:3000/");
  if (devMode) {
    // MFE dev servers must be up before the shell asks for their entries.
    await waitFor("http://localhost:5175/remoteEntry.js", 60_000);
    await waitFor("http://localhost:5176/remoteEntry.js", 60_000);
  }

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

  // The Svelte MFE's <style> block reaches the shell. A built remote extracts
  // its CSS into an asset that only the remote's own index.html links, so
  // without kit's css-injected-by-js the clock renders unstyled *in the shell*
  // while looking fine standalone — invisible to every other assertion here
  // (dx-findings #4).
  const clockStyles = await page.evaluate(() => {
    const el = document.querySelector('[data-mfkit-mount="mfe_clock"] .clock');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { padding: cs.paddingTop, border: cs.borderTopWidth };
  });
  if (!clockStyles) {
    throw new Error("mfe_clock did not render a .clock element");
  }
  if (clockStyles.padding === "0px" || clockStyles.border === "0px") {
    throw new Error(
      `mfe_clock rendered unstyled in the shell — remote CSS did not reach the host: ${JSON.stringify(clockStyles)}`,
    );
  }
  console.log(`ok  mfe_clock styled in shell (padding ${clockStyles.padding})`);

  if (pageErrors.length > 0) {
    throw new Error(`page errors:\n  ${pageErrors.join("\n  ")}`);
  }

  // The CSP check exercises kit's build-time CSS injection; in dev, styles
  // come through Vite's own client instead.
  if (!devMode) await checkStrictCsp(browser);

  console.log(devMode ? "e2e (dev) passed" : "e2e passed");
} catch (err) {
  console.error(`e2e failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
} finally {
  await servers.stop();
  await browser.close();
}
process.exit(failed ? 1 : 0);

async function checkStrictCsp(browser) {
  // Strict CSP (review O6): styles only with a matching nonce. The host
  // advertises it via <meta property="csp-nonce">, Vite's convention; kit's
  // injected <style> must pick it up or the remote renders unstyled again.
  const nonce = "mfkitE2eNonce";
  // Served through a local proxy rather than Playwright's route.fulfill: a
  // fulfilled document has no network address, so Chrome's Local Network
  // Access check would block its requests to the localhost remotes.
  const cspProxy = await startCspProxy(nonce);
  const cspPage = await browser.newPage();
  const cspViolations = [];
  cspPage.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) {
      cspViolations.push(m.text());
    }
  });
  await cspPage.goto(cspProxy.url, { waitUntil: "domcontentloaded" });
  await cspPage.waitForSelector('[data-mfkit-outlet="mfe_clock"][data-mfkit-state="mounted"]', {
    timeout: 15_000,
  });
  const cspPadding = await cspPage.evaluate(() => {
    const el = document.querySelector('[data-mfkit-mount="mfe_clock"] .clock');
    return el ? getComputedStyle(el).paddingTop : null;
  });
  if (!cspPadding || cspPadding === "0px") {
    throw new Error(
      `mfe_clock unstyled under strict CSP (padding ${cspPadding}); violations:\n  ${cspViolations.join("\n  ")}`,
    );
  }
  console.log(`ok  mfe_clock styled under strict CSP via nonce (padding ${cspPadding})`);
  await cspPage.close();
  await cspProxy.close();
}
