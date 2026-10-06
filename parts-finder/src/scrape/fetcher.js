// Optional auto-fetch layer, powered by Playwright.
//
// It is intentionally lazy: the app runs fine without Playwright installed,
// and every other feature (deep-link search, catalog, comparison worksheet)
// works regardless. Only this module needs a browser.
//
// Login model: we do NOT store your passwords. For a site that needs a login,
// you run `loginInteractive` once — a real browser window opens, you sign in
// by hand (handling any cookie banner / 2FA), and we save the authenticated
// session to data/auth/<providerId>.json. Later fetches reuse that session.

const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../store");

const AUTH_DIR = path.join(DATA_DIR, "auth");

function authPath(providerId) {
  return path.join(AUTH_DIR, `${providerId}.json`);
}

function hasAuth(providerId) {
  return fs.existsSync(authPath(providerId));
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (err) {
    const e = new Error(
      "Playwright is not installed. Auto-fetch is optional — run " +
        "`npm install` then `npm run fetch:install-browser` inside parts-finder/ to enable it."
    );
    e.code = "NO_PLAYWRIGHT";
    throw e;
  }
}

function buildSearchUrl(provider, q) {
  const term = encodeURIComponent(String(q || "").trim());
  if (provider.searchTemplate && provider.searchTemplate.includes("{q}")) {
    return provider.searchTemplate.replace("{q}", term);
  }
  return null;
}

// Open a headed browser so the user can log in by hand, then persist the session.
async function loginInteractive(provider) {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Land them on the site's home/search so they can sign in.
  const landing = buildSearchUrl(provider, "") || provider.searchTemplate || "about:blank";
  try {
    await page.goto(landing.replace("{q}", ""), { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (_) {
    /* ignore navigation issues; the user can type the URL */
  }

  // Wait until the user closes the window (they log in, then close it).
  await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
  // If they closed the page but not the browser, give context a moment.
  try {
    await context.storageState({ path: authPath(provider.id) });
  } catch (err) {
    await browser.close().catch(() => {});
    throw new Error(`Could not save session for ${provider.name}: ${err.message}`);
  }
  await browser.close().catch(() => {});
  return { saved: true, provider: provider.id };
}

// Headless fetch of the first result's price + link for a query.
async function fetchOne(provider, q, { timeoutMs = 30000 } = {}) {
  const url = buildSearchUrl(provider, q);
  if (!url) {
    return { providerId: provider.id, ok: false, reason: "no-search-template", url: null };
  }
  if (!provider.priceSelector && !provider.linkSelector) {
    return { providerId: provider.id, ok: false, reason: "no-selectors", url };
  }

  const { chromium } = loadPlaywright();
  const launchOpts = { headless: true };
  const contextOpts = {};
  if (hasAuth(provider.id)) contextOpts.storageState = authPath(provider.id);

  const browser = await chromium.launch(launchOpts);
  try {
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    let price = null;
    let link = null;
    if (provider.priceSelector) {
      const el = await page.$(provider.priceSelector);
      if (el) price = (await el.innerText()).trim();
    }
    if (provider.linkSelector) {
      const el = await page.$(provider.linkSelector);
      if (el) {
        link = await el.getAttribute("href");
        if (link && link.startsWith("/")) {
          const u = new URL(url);
          link = u.origin + link;
        }
      }
    }

    return {
      providerId: provider.id,
      ok: Boolean(price || link),
      reason: price || link ? null : "no-match",
      url,
      price,
      link,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return { providerId: provider.id, ok: false, reason: `error: ${err.message}`, url };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { loginInteractive, fetchOne, hasAuth, buildSearchUrl, authPath };
