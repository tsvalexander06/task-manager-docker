// Tiny JSON-file data store. No database to install — everything lives in
// data/store.json so you can inspect, back up, or hand-edit it.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const defaultProviders = require("./providers/defaults");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function emptyStore() {
  return {
    version: 1,
    providers: defaultProviders.map((p) => ({ ...p })),
    machines: [],
    parts: []
  };
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "auth"), { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const s = emptyStore();
    save(s);
    return s;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const s = JSON.parse(raw);
    // Backfill any newly-added default providers (by id) without clobbering edits.
    const have = new Set((s.providers || []).map((p) => p.id));
    for (const dp of defaultProviders) {
      if (!have.has(dp.id)) s.providers.push({ ...dp });
    }
    s.machines = s.machines || [];
    s.parts = s.parts || [];
    return s;
  } catch (err) {
    throw new Error(`Could not read ${STORE_PATH}: ${err.message}`);
  }
}

function save(store) {
  ensureDir();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function id() {
  return crypto.randomBytes(8).toString("hex");
}

module.exports = { load, save, id, DATA_DIR, STORE_PATH };
