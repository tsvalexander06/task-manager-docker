const path = require("path");
const express = require("express");
const store = require("./store");
const fetcher = require("./scrape/fetcher");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- helpers ---------------------------------------------------------------

function buildSearchUrl(provider, q) {
  const term = encodeURIComponent(String(q || "").trim());
  if (provider.searchTemplate && provider.searchTemplate.includes("{q}")) {
    return provider.searchTemplate.replace("{q}", term);
  }
  return null;
}

// For a query, return each enabled provider's ready-to-open search URL.
function searchLinks(providers, q) {
  return providers
    .filter((p) => p.enabled)
    .map((p) => ({
      providerId: p.id,
      name: p.name,
      // URL-mode: direct results link. Form-mode (no template): open the site
      // so the user can type the query into its search box.
      url: buildSearchUrl(p, q) || p.siteUrl || null,
      formMode: !buildSearchUrl(p, q) && Boolean(p.siteUrl),
      hasAuth: fetcher.hasAuth(p.id)
    }));
}

function findPart(db, id) {
  return db.parts.find((p) => p.id === id);
}

// ---- providers / settings --------------------------------------------------

app.get("/api/providers", (req, res) => {
  const db = store.load();
  const withAuth = db.providers.map((p) => ({ ...p, hasAuth: fetcher.hasAuth(p.id) }));
  res.json(withAuth);
});

app.put("/api/providers/:id", (req, res) => {
  const db = store.load();
  const p = db.providers.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "provider not found" });
  const allowed = ["name", "enabled", "searchTemplate", "siteUrl", "searchInputSelector", "priceSelector", "linkSelector", "notes"];
  for (const k of allowed) {
    if (k in req.body) p[k] = req.body[k];
  }
  store.save(db);
  res.json({ ...p, hasAuth: fetcher.hasAuth(p.id) });
});

// ---- machines --------------------------------------------------------------

app.get("/api/machines", (req, res) => {
  res.json(store.load().machines);
});

app.post("/api/machines", (req, res) => {
  const db = store.load();
  const { brand = "", model = "", serial = "", type = "", notes = "", manualUrl = "" } = req.body || {};
  if (!brand && !model) return res.status(400).json({ error: "brand or model required" });
  const m = { id: store.id(), brand, model, serial, type, notes, manualUrl, createdAt: new Date().toISOString() };
  db.machines.push(m);
  store.save(db);
  res.status(201).json(m);
});

app.put("/api/machines/:id", (req, res) => {
  const db = store.load();
  const m = db.machines.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: "machine not found" });
  for (const k of ["brand", "model", "serial", "type", "notes", "manualUrl"]) {
    if (k in req.body) m[k] = req.body[k];
  }
  store.save(db);
  res.json(m);
});

app.delete("/api/machines/:id", (req, res) => {
  const db = store.load();
  const before = db.machines.length;
  db.machines = db.machines.filter((x) => x.id !== req.params.id);
  // Detach from any parts.
  for (const p of db.parts) {
    p.machineIds = (p.machineIds || []).filter((mid) => mid !== req.params.id);
  }
  store.save(db);
  res.json({ deleted: before - db.machines.length });
});

// ---- parts -----------------------------------------------------------------

app.get("/api/parts", (req, res) => {
  const db = store.load();
  const { machineId, q } = req.query;
  let parts = db.parts;
  if (machineId) parts = parts.filter((p) => (p.machineIds || []).includes(machineId));
  if (q) {
    const needle = String(q).toLowerCase();
    parts = parts.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(needle) ||
        (p.oemNumber || "").toLowerCase().includes(needle) ||
        (p.notes || "").toLowerCase().includes(needle)
    );
  }
  res.json(parts);
});

app.post("/api/parts", (req, res) => {
  const db = store.load();
  const { name = "", oemNumber = "", machineIds = [], notes = "" } = req.body || {};
  if (!name && !oemNumber) return res.status(400).json({ error: "name or oemNumber required" });
  const part = {
    id: store.id(),
    name,
    oemNumber,
    machineIds: Array.isArray(machineIds) ? machineIds : [],
    notes,
    siteRefs: {}, // providerId -> { sku, url, price, currency, checkedAt }
    createdAt: new Date().toISOString()
  };
  db.parts.push(part);
  store.save(db);
  res.status(201).json(part);
});

app.put("/api/parts/:id", (req, res) => {
  const db = store.load();
  const part = findPart(db, req.params.id);
  if (!part) return res.status(404).json({ error: "part not found" });
  for (const k of ["name", "oemNumber", "machineIds", "notes"]) {
    if (k in req.body) part[k] = req.body[k];
  }
  store.save(db);
  res.json(part);
});

// Record a price/link you found (manually or via fetch) for one provider.
app.put("/api/parts/:id/site/:providerId", (req, res) => {
  const db = store.load();
  const part = findPart(db, req.params.id);
  if (!part) return res.status(404).json({ error: "part not found" });
  part.siteRefs = part.siteRefs || {};
  const prev = part.siteRefs[req.params.providerId] || {};
  const { sku, url, price, currency } = req.body || {};
  part.siteRefs[req.params.providerId] = {
    sku: sku !== undefined ? sku : prev.sku || "",
    url: url !== undefined ? url : prev.url || "",
    price: price !== undefined ? price : prev.price || "",
    currency: currency !== undefined ? currency : prev.currency || "",
    checkedAt: new Date().toISOString()
  };
  store.save(db);
  res.json(part);
});

app.delete("/api/parts/:id", (req, res) => {
  const db = store.load();
  const before = db.parts.length;
  db.parts = db.parts.filter((x) => x.id !== req.params.id);
  store.save(db);
  res.json({ deleted: before - db.parts.length });
});

// ---- search links ----------------------------------------------------------

// Deep links for an arbitrary query (part number, model, keyword).
app.get("/api/search-links", (req, res) => {
  const db = store.load();
  const q = req.query.q || "";
  res.json({ q, links: searchLinks(db.providers, q) });
});

// Deep links for a saved part (searches by OEM number, falling back to name).
app.get("/api/parts/:id/links", (req, res) => {
  const db = store.load();
  const part = findPart(db, req.params.id);
  if (!part) return res.status(404).json({ error: "part not found" });
  const q = part.oemNumber || part.name;
  res.json({ q, links: searchLinks(db.providers, q) });
});

// ---- optional auto-fetch ----------------------------------------------------

app.post("/api/providers/:id/login", async (req, res) => {
  const db = store.load();
  const provider = db.providers.find((x) => x.id === req.params.id);
  if (!provider) return res.status(404).json({ error: "provider not found" });
  try {
    const out = await fetcher.loginInteractive(provider);
    res.json(out);
  } catch (err) {
    res.status(err.code === "NO_PLAYWRIGHT" ? 501 : 500).json({ error: err.message, code: err.code });
  }
});

// Auto-fetch prices for a query across providers (best-effort, beta).
app.post("/api/fetch", async (req, res) => {
  const db = store.load();
  const { q, providerIds } = req.body || {};
  if (!q) return res.status(400).json({ error: "q required" });
  let providers = db.providers.filter((p) => p.enabled);
  if (Array.isArray(providerIds) && providerIds.length) {
    providers = providers.filter((p) => providerIds.includes(p.id));
  }
  try {
    const results = [];
    for (const p of providers) {
      // Sequential to keep it gentle on the sites and on the machine.
      // eslint-disable-next-line no-await-in-loop
      results.push({ name: p.name, ...(await fetcher.fetchOne(p, q)) });
    }
    res.json({ q, results });
  } catch (err) {
    res.status(err.code === "NO_PLAYWRIGHT" ? 501 : 500).json({ error: err.message, code: err.code });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`\n  Parts Finder running:  http://localhost:${PORT}\n`);
});
