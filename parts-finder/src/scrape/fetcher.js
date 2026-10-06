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
  const landing =
    provider.siteUrl || buildSearchUrl(provider, "") || provider.searchTemplate || "about:blank";
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
// Two search modes:
//   URL mode  — searchTemplate has {q}; navigate straight to the results URL.
//   FORM mode — no template, but siteUrl + searchInputSelector are set; load
//               the site, type the query into the search box, submit.
// Wait up to ~10s for any of the comma-separated candidate selectors to appear;
// return the first that exists. Lets one config cover several site layouts.
async function firstExisting(page, selectorList, timeoutMs) {
  const cands = String(selectorList || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!cands.length) return null;
  const deadline = Date.now() + Math.min(timeoutMs, 10000);
  do {
    for (const c of cands) {
      const el = await page.$(c).catch(() => null);
      if (el) return c;
    }
    await page.waitForTimeout(300);
  } while (Date.now() < deadline);
  return null;
}

// Heuristically find the first real product link on a search-results page, so a
// product-page price selector works without a hand-set link selector.
async function firstResultLink(page) {
  return page.evaluate(() => {
    const origin = location.origin;
    const bad = /(login|sign[-_]?in|account|logout|register|cart|basket|wishlist|checkout|contact|privacy|terms|cookie|compare|newsletter)/i;
    let best = null, bestScore = 4; // require a decent match
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const raw = a.getAttribute("href") || "";
      if (!raw || /^(#|javascript:|mailto:|tel:)/i.test(raw)) continue;
      let abs; try { abs = new URL(raw, location.href); } catch { continue; }
      if (abs.origin !== origin) continue;
      if (bad.test(abs.href)) continue;
      const path = abs.pathname;
      let score = 0;
      if (/\/(product|products|item|items|prod|artikel|articolo|p)\//i.test(path)) score += 5;
      if (/\.html?($|\?)/i.test(path)) score += 2;
      if (/\d{3,}/.test(path)) score += 2;
      let el = a, depth = 0;
      while (el && depth < 4) {
        const cls = typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "";
        if (/product|item|result|card|catalog|listing/i.test(cls)) { score += 3; break; }
        el = el.parentElement; depth++;
      }
      if (a.querySelector("img")) score += 1;
      if ((a.textContent || "").trim().length > 8) score += 1;
      if (score > bestScore) { bestScore = score; best = abs.href; }
    }
    return best;
  }).catch(() => null);
}

// Two search modes:
//   URL mode  — searchTemplate has {q}; navigate straight to the results URL.
//   FORM mode — no template, but siteUrl + searchInputSelector are set; load
//               the site, type the query into the search box, submit.
async function fetchOne(provider, q, { timeoutMs = 30000 } = {}) {
  const url = buildSearchUrl(provider, q);
  const formMode = !url && provider.siteUrl && provider.searchInputSelector;
  if (!url && !formMode) {
    return { providerId: provider.id, ok: false, reason: "no-search-template", url: null };
  }
  if (!provider.priceSelector) {
    return { providerId: provider.id, ok: false, reason: "no-price-selector", url: url || provider.siteUrl };
  }

  const { chromium } = loadPlaywright();
  const contextOpts = {};
  if (hasAuth(provider.id)) contextOpts.storageState = authPath(provider.id);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();

    if (formMode) {
      await page.goto(provider.siteUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const sel = await firstExisting(page, provider.searchInputSelector, timeoutMs);
      if (!sel) {
        return { providerId: provider.id, ok: false, reason: "search-box-not-found", url: provider.siteUrl };
      }
      await page.fill(sel, String(q));
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {}),
        page.press(sel, "Enter")
      ]);
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    }

    const readPrice = async () => {
      const el = await page.$(provider.priceSelector);
      if (el) {
        const t = (await el.innerText().catch(() => null)) || (await el.textContent().catch(() => null));
        if (t && t.trim()) return t.trim().replace(/\s+/g, " ");
      }
      const fb = await page.$("[itemprop='price'], meta[itemprop='price']");
      if (fb) {
        const t = (await fb.getAttribute("content")) || (await fb.innerText().catch(() => null));
        if (t && t.trim()) return t.trim().replace(/\s+/g, " ");
      }
      return null;
    };

    let link = page.url();
    let price = await readPrice(); // works if search redirected straight to the product

    if (!price) {
      // Results list: open the first product, then read its price.
      let target = null;
      if (provider.linkSelector) {
        const el = await page.$(provider.linkSelector);
        if (el) {
          let href = await el.getAttribute("href");
          if (href && href.startsWith("/")) href = new URL(page.url()).origin + href;
          target = href;
        }
      } else {
        target = await firstResultLink(page);
      }
      if (target && target !== page.url()) {
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
        link = page.url();
        price = await readPrice();
      }
    }

    return {
      providerId: provider.id,
      ok: Boolean(price),
      reason: price ? null : "no-price-found",
      url: url || provider.siteUrl,
      price,
      link,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return { providerId: provider.id, ok: false, reason: `error: ${err.message}`, url: url || provider.siteUrl || null };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { loginInteractive, fetchOne, hasAuth, buildSearchUrl, authPath };
