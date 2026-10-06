"use strict";

const api = {
  async get(url) { const r = await fetch(url); if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); },
  async send(method, url, body) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
  post(u, b) { return this.send("POST", u, b); },
  put(u, b) { return this.send("PUT", u, b); },
  del(u) { return this.send("DELETE", u); }
};

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let PROVIDERS = [];
let MACHINES = [];

// ---- tabs ----
document.querySelectorAll("#tabs button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("tab-" + b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "catalog") loadParts();
    if (b.dataset.tab === "machines") loadMachines();
    if (b.dataset.tab === "settings") loadProviders();
  });
});

// ---- search ----
document.getElementById("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = document.getElementById("searchQ").value.trim();
  if (!q) return;
  const { links } = await api.get("/api/search-links?q=" + encodeURIComponent(q));
  renderSearchLinks(links);
});

function renderSearchLinks(links) {
  const el = document.getElementById("searchLinks");
  if (!links.length) { el.innerHTML = '<p class="muted">No enabled suppliers. Enable some in Settings.</p>'; return; }
  el.innerHTML = links.map((l) => `
    <div class="card">
      <span class="name">${esc(l.name)}</span>
      ${l.url
        ? `<a class="open" href="${esc(l.url)}" target="_blank" rel="noopener"><button class="small">Open search ↗</button></a>`
        : `<span class="muted">No search URL set (Settings)</span>`}
      <span class="badge ${l.hasAuth ? "" : "off"}">${l.hasAuth ? "session saved" : "not logged in"}</span>
    </div>`).join("");
}

document.getElementById("autoFetchBtn").addEventListener("click", async () => {
  const q = document.getElementById("searchQ").value.trim();
  if (!q) return toast("Enter a search term first");
  const box = document.getElementById("fetchResults");
  box.innerHTML = '<p class="muted">Fetching… (this opens headless browsers; may take a moment)</p>';
  try {
    const { results } = await api.post("/api/fetch", { q });
    box.innerHTML = `<div class="block"><h2>Auto-fetch results</h2><table>
      <tr><th>Supplier</th><th>Price</th><th>Link</th><th>Status</th></tr>
      ${results.map((r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="price">${esc(r.price || "—")}</td>
        <td>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">open ↗</a>` : "—"}</td>
        <td class="muted">${esc(r.ok ? "ok" : r.reason || "")}</td>
      </tr>`).join("")}
    </table><p class="hint">Blank results usually mean the search URL or price selector isn't set yet (Settings), or you need to log in (Settings → Log in).</p></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Auto-fetch unavailable: ${esc(err.message)}</p>`;
  }
});

// ---- save part (from search tab) ----
document.getElementById("savePartForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    name: f.name.value.trim(),
    oemNumber: f.oemNumber.value.trim() || document.getElementById("searchQ").value.trim(),
    machineIds: f.machineId.value ? [f.machineId.value] : []
  };
  if (!body.name && !body.oemNumber) return toast("Enter a part name or number");
  await api.post("/api/parts", body);
  f.reset();
  toast("Part saved");
});

// ---- catalog ----
document.getElementById("catalogFilter").addEventListener("input", (e) => loadParts(e.target.value));

async function loadParts(filter) {
  const url = "/api/parts" + (filter ? "?q=" + encodeURIComponent(filter) : "");
  const parts = await api.get(url);
  const el = document.getElementById("partsList");
  if (!parts.length) { el.innerHTML = '<p class="muted">No parts yet. Save one from the Search tab.</p>'; return; }
  el.innerHTML = parts.map(renderPart).join("");
}

function renderPart(p) {
  const machineNames = (p.machineIds || []).map((id) => {
    const m = MACHINES.find((x) => x.id === id);
    return m ? esc(`${m.brand} ${m.model}`.trim()) : "";
  }).filter(Boolean).join(", ");

  const rows = PROVIDERS.filter((pr) => pr.enabled).map((pr) => {
    const ref = (p.siteRefs || {})[pr.id] || {};
    return `<tr>
      <td>${esc(pr.name)}</td>
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="price" value="${esc(ref.price || "")}" placeholder="price" style="width:90px"/></td>
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="currency" value="${esc(ref.currency || "")}" placeholder="£/€" style="width:60px"/></td>
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="url" value="${esc(ref.url || "")}" placeholder="link you found" /></td>
      <td>
        <button class="small save-ref" data-part="${p.id}" data-prov="${pr.id}">Save</button>
        ${ref.url ? `<a href="${esc(ref.url)}" target="_blank" rel="noopener">↗</a>` : ""}
      </td>
    </tr>`;
  }).join("");

  return `<div class="item">
    <div class="row between">
      <div>
        <h3>${esc(p.name || "(unnamed)")} ${p.oemNumber ? `<span class="muted">· ${esc(p.oemNumber)}</span>` : ""}</h3>
        <div class="meta">${machineNames ? "For: " + machineNames : "Not linked to a machine"}</div>
      </div>
      <div class="row">
        <button class="small open-part" data-id="${p.id}">Open all searches</button>
        <button class="danger del-part" data-id="${p.id}">Delete</button>
      </div>
    </div>
    <table>
      <tr><th>Supplier</th><th>Price</th><th>Cur.</th><th>Link</th><th></th></tr>
      ${rows}
    </table>
  </div>`;
}

document.getElementById("partsList").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.classList.contains("del-part")) {
    if (!confirm("Delete this part?")) return;
    await api.del("/api/parts/" + t.dataset.id); loadParts(); toast("Deleted");
  } else if (t.classList.contains("open-part")) {
    const { links } = await api.get("/api/parts/" + t.dataset.id + "/links");
    links.forEach((l) => l.url && window.open(l.url, "_blank", "noopener"));
  } else if (t.classList.contains("save-ref")) {
    const partId = t.dataset.part, prov = t.dataset.prov;
    const fields = document.querySelectorAll(`#partsList input[data-part="${partId}"][data-prov="${prov}"]`);
    const body = {};
    fields.forEach((f) => { body[f.dataset.field] = f.value; });
    await api.put(`/api/parts/${partId}/site/${prov}`, body);
    toast("Saved");
  }
});

// ---- machines ----
document.getElementById("machineForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = ["brand", "model", "serial", "type", "manualUrl", "notes"].reduce((o, k) => (o[k] = f[k].value.trim(), o), {});
  if (!body.brand && !body.model) return toast("Enter a brand or model");
  await api.post("/api/machines", body);
  f.reset(); loadMachines(); toast("Machine added");
});

async function loadMachines() {
  MACHINES = await api.get("/api/machines");
  const el = document.getElementById("machinesList");
  el.innerHTML = MACHINES.length
    ? MACHINES.map((m) => `<div class="item">
        <div class="row between">
          <div>
            <h3>${esc(`${m.brand} ${m.model}`.trim()) || "(unnamed)"}</h3>
            <div class="meta">${[m.type, m.serial && "S/N " + m.serial, m.notes].filter(Boolean).map(esc).join(" · ")}
            ${m.manualUrl ? ` · <a href="${esc(m.manualUrl)}" target="_blank" rel="noopener">manual ↗</a>` : ""}</div>
          </div>
          <button class="danger del-machine" data-id="${m.id}">Delete</button>
        </div>
      </div>`).join("")
    : '<p class="muted">No machines yet.</p>';
  // refresh the part-save machine dropdown
  const sel = document.querySelector('#savePartForm select[name="machineId"]');
  sel.innerHTML = '<option value="">— link to machine (optional) —</option>' +
    MACHINES.map((m) => `<option value="${m.id}">${esc(`${m.brand} ${m.model}`.trim())}</option>`).join("");
}

document.getElementById("machinesList").addEventListener("click", async (e) => {
  if (e.target.classList.contains("del-machine")) {
    if (!confirm("Delete this machine?")) return;
    await api.del("/api/machines/" + e.target.dataset.id); loadMachines(); toast("Deleted");
  }
});

// ---- settings / providers ----
async function loadProviders() {
  PROVIDERS = await api.get("/api/providers");
  const el = document.getElementById("providersList");
  el.innerHTML = PROVIDERS.map((p) => `
    <div class="provider-edit" data-id="${p.id}">
      <div class="row between">
        <strong>${esc(p.name)}</strong>
        <label class="row" style="font-size:13px;color:var(--text)">
          <input type="checkbox" data-field="enabled" ${p.enabled ? "checked" : ""} style="width:auto"/> enabled
        </label>
      </div>
      <label>Search URL template (use {q} for the search term)</label>
      <input data-field="searchTemplate" value="${esc(p.searchTemplate || "")}" />
      <label>Price selector (optional, for auto-fetch)</label>
      <input data-field="priceSelector" value="${esc(p.priceSelector || "")}" placeholder="CSS selector, e.g. .product-price" />
      <label>Result link selector (optional, for auto-fetch)</label>
      <input data-field="linkSelector" value="${esc(p.linkSelector || "")}" placeholder="CSS selector, e.g. a.product-item-link" />
      <div class="row" style="margin-top:10px">
        <button class="small save-provider" data-id="${p.id}">Save</button>
        <button class="small ghost login-provider" data-id="${p.id}">Log in (save session)</button>
        <span class="badge ${p.hasAuth ? "" : "off"}">${p.hasAuth ? "session saved" : "no session"}</span>
      </div>
      ${p.notes ? `<p class="hint" style="margin-top:8px">${esc(p.notes)}</p>` : ""}
    </div>`).join("");
}

document.getElementById("providersList").addEventListener("click", async (e) => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains("save-provider")) {
    const box = e.target.closest(".provider-edit");
    const body = {};
    box.querySelectorAll("[data-field]").forEach((f) => {
      body[f.dataset.field] = f.type === "checkbox" ? f.checked : f.value;
    });
    await api.put("/api/providers/" + id, body);
    toast("Saved"); loadProviders();
  } else if (e.target.classList.contains("login-provider")) {
    toast("Opening browser — log in, then close the window");
    try {
      await api.post("/api/providers/" + id + "/login");
      toast("Session saved"); loadProviders();
    } catch (err) { toast(err.message); }
  }
});

// ---- init ----
(async function init() {
  try {
    PROVIDERS = await api.get("/api/providers");
    MACHINES = await api.get("/api/machines");
    const sel = document.querySelector('#savePartForm select[name="machineId"]');
    sel.innerHTML = '<option value="">— link to machine (optional) —</option>' +
      MACHINES.map((m) => `<option value="${m.id}">${esc(`${m.brand} ${m.model}`.trim())}</option>`).join("");
    renderSearchLinks(PROVIDERS.filter((p) => p.enabled).map((p) => ({ providerId: p.id, name: p.name, url: null, hasAuth: p.hasAuth })));
  } catch (err) { toast("Could not reach server: " + err.message); }
})();
