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

// Translate a fetch result's status into Bulgarian guidance.
function reasonBg(r) {
  if (r.ok) return "ок";
  const raw = r.reason || "";
  if (raw.startsWith("error")) return "грешка: " + raw.slice(7);
  const map = {
    "no-price-found": "не е намерена цена (нужен е вход или друг селектор)",
    "no-price-selector": "няма зададен селектор за цена (Настройки)",
    "no-search-template": "няма зададен адрес за търсене (Настройки)",
    "search-box-not-found": "търсачката не е намерена (първо влезте / задайте селектор)"
  };
  return map[raw] || raw;
}

let PROVIDERS = [];
let MACHINES = [];

// Build a supplier's search URL in the browser (no server round-trip).
function clientSearchUrl(p, q) {
  const term = encodeURIComponent(String(q || "").trim());
  if (p.searchTemplate && p.searchTemplate.includes("{q}")) return p.searchTemplate.replace("{q}", term);
  return p.siteUrl || null; // form-mode / no template: open the site
}
// Stable colour per supplier for the tile icon.
function tileColor(id) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 58% 45%)`;
}
function initials(name) {
  return name.replace(/[()]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

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

// ---- search hero: tiles ----
function renderTiles() {
  const el = document.getElementById("tiles");
  const enabled = PROVIDERS.filter((p) => p.enabled);
  if (!enabled.length) { el.innerHTML = '<p class="muted">Няма активни доставчици. Активирайте ги в Настройки.</p>'; return; }
  el.innerHTML = enabled.map((p) => `
    <a class="tile" data-id="${p.id}" href="#" title="${esc(p.name)}">
      <span class="ic" style="background:${tileColor(p.id)}">${esc(initials(p.name))}</span>
      <span class="tn">${esc(p.name)}</span>
      <span class="st ${p.hasAuth ? "on" : ""}">${p.hasAuth ? "влезли сте" : ""}</span>
    </a>`).join("");
}

document.getElementById("tiles").addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  e.preventDefault();
  const p = PROVIDERS.find((x) => x.id === tile.dataset.id);
  const q = document.getElementById("searchQ").value.trim();
  const url = clientSearchUrl(p, q);
  if (!url) return toast("Няма зададен адрес за този доставчик (Настройки)");
  window.open(url, "_blank", "noopener");
});

// Enter / "Търси" = open every supplier's search (one tab each).
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("searchQ").value.trim();
  if (!q) return toast("Първо въведете дума за търсене");
  const enabled = PROVIDERS.filter((p) => p.enabled);
  let opened = 0;
  enabled.forEach((p) => { const u = clientSearchUrl(p, q); if (u) { window.open(u, "_blank", "noopener"); opened++; } });
  if (opened > 1) toast("Ако браузърът блокира отварянето на няколко раздела, ползвайте плочките долу");
});

document.getElementById("autoFetchBtn").addEventListener("click", async () => {
  const q = document.getElementById("searchQ").value.trim();
  if (!q) return toast("Първо въведете дума за търсене");
  const box = document.getElementById("fetchResults");
  box.innerHTML = '<p class="muted">Зареждане… (отварят се браузъри във фонов режим; може да отнеме малко)</p>';
  try {
    const { results } = await api.post("/api/fetch", { q });
    box.innerHTML = `<div class="block"><h2>Автоматично намерени цени</h2><table>
      <tr><th>Доставчик</th><th>Цена</th><th>Връзка</th><th>Статус</th></tr>
      ${results.map((r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="price">${esc(r.price || "—")}</td>
        <td>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">отвори ↗</a>` : "—"}</td>
        <td class="muted">${esc(reasonBg(r))}</td>
      </tr>`).join("")}
    </table><p class="hint">Празен резултат обикновено означава, че адресът за търсене или селекторът за цена още не е зададен (Настройки), или трябва да влезете (Настройки → Вход).</p></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Автоматичните цени не са налични: ${esc(err.message)}</p>`;
  }
});

// ---- diagnostics ----
document.getElementById("debugBtn").addEventListener("click", async () => {
  const q = document.getElementById("searchQ").value.trim();
  if (!q) return toast("Първо въведете дума за търсене");
  const box = document.getElementById("fetchResults");
  box.innerHTML = '<p class="muted">Диагностика… отварят се сайтовете и се търсят цени (може да отнеме малко)</p>';
  try {
    const { results } = await api.post("/api/debug", { q });
    box.innerHTML = `<div class="block"><h2>Диагностика</h2>
      <p class="hint">За всеки сайт: ако цената не е намерена, натиснете верния ред „цена“ отдолу — селекторът се запазва автоматично и после пробвайте „Автоматични цени“ пак.</p>
      ${results.map(renderDebug).join("")}</div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Диагностиката не е налична: ${esc(err.message)}</p>`;
  }
});

function renderDebug(r) {
  if (r.error) return `<div class="item"><h3>${esc(r.name)}</h3><div class="meta">грешка: ${esc(r.error)}</div></div>`;
  const login = r.loggedIn ? "влезли сте" : "НЕ сте влезли";
  const warn = r.looksLoggedOut ? ' · <span style="color:var(--warn)">изглежда нужен е вход</span>' : "";
  const foundLine = r.priceSelectorFound
    ? `<div class="meta" style="color:var(--ok)">текущият селектор намери: ${esc(r.priceSelectorText || "")}</div>`
    : `<div class="meta" style="color:var(--warn)">текущият селектор НЕ намери цена</div>`;
  const cands = (r.candidates || []).length
    ? `<table><tr><th>Възможна цена</th><th>Селектор</th><th></th></tr>
       ${r.candidates.map((c) => `<tr>
         <td class="price">${esc(c.text)}</td>
         <td class="muted" style="font-size:12px">${esc(c.selector)}</td>
         <td><button class="small set-price" data-prov="${esc(r.providerId)}" data-sel="${esc(c.selector)}">Задай като цена</button></td>
       </tr>`).join("")}</table>`
    : '<div class="meta">няма открити елементи, приличащи на цена (вероятно трябва вход)</div>';
  return `<div class="item">
    <h3>${esc(r.name)} <span class="muted" style="font-size:12px">· ${esc(login)}${warn}</span></h3>
    ${r.url ? `<div class="meta">страница: <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.slice(0, 70))}↗</a></div>` : ""}
    ${foundLine}
    ${cands}
  </div>`;
}

document.getElementById("fetchResults").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("set-price")) return;
  const prov = e.target.dataset.prov, sel = e.target.dataset.sel;
  try {
    await api.put("/api/providers/" + prov, { priceSelector: sel });
    // keep local copy in sync so tiles/fetch use it immediately
    const p = PROVIDERS.find((x) => x.id === prov); if (p) p.priceSelector = sel;
    toast("Селекторът за цена е запазен за " + prov);
  } catch (err) { toast(err.message); }
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
  if (!body.name && !body.oemNumber) return toast("Въведете име или номер на частта");
  await api.post("/api/parts", body);
  f.reset();
  toast("Частта е записана");
});

// ---- catalog ----
document.getElementById("catalogFilter").addEventListener("input", (e) => loadParts(e.target.value));

async function loadParts(filter) {
  const url = "/api/parts" + (filter ? "?q=" + encodeURIComponent(filter) : "");
  const parts = await api.get(url);
  const el = document.getElementById("partsList");
  if (!parts.length) { el.innerHTML = '<p class="muted">Все още няма части. Запишете от раздел „Търсене“.</p>'; return; }
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
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="price" value="${esc(ref.price || "")}" placeholder="цена" style="width:90px"/></td>
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="currency" value="${esc(ref.currency || "")}" placeholder="лв/€/£" style="width:64px"/></td>
      <td><input data-part="${p.id}" data-prov="${pr.id}" data-field="url" value="${esc(ref.url || "")}" placeholder="намерена връзка" /></td>
      <td>
        <button class="small save-ref" data-part="${p.id}" data-prov="${pr.id}">Запис</button>
        ${ref.url ? `<a href="${esc(ref.url)}" target="_blank" rel="noopener">↗</a>` : ""}
      </td>
    </tr>`;
  }).join("");

  return `<div class="item">
    <div class="row between">
      <div>
        <h3>${esc(p.name || "(без име)")} ${p.oemNumber ? `<span class="muted">· ${esc(p.oemNumber)}</span>` : ""}</h3>
        <div class="meta">${machineNames ? "За: " + machineNames : "Не е свързана с машина"}</div>
      </div>
      <div class="row">
        <button class="small open-part" data-id="${p.id}">Отвори всички търсения</button>
        <button class="danger del-part" data-id="${p.id}">Изтрий</button>
      </div>
    </div>
    <table>
      <tr><th>Доставчик</th><th>Цена</th><th>Вал.</th><th>Връзка</th><th></th></tr>
      ${rows}
    </table>
  </div>`;
}

document.getElementById("partsList").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.classList.contains("del-part")) {
    if (!confirm("Да изтрия ли тази част?")) return;
    await api.del("/api/parts/" + t.dataset.id); loadParts(); toast("Изтрито");
  } else if (t.classList.contains("open-part")) {
    const { links } = await api.get("/api/parts/" + t.dataset.id + "/links");
    links.forEach((l) => l.url && window.open(l.url, "_blank", "noopener"));
  } else if (t.classList.contains("save-ref")) {
    const partId = t.dataset.part, prov = t.dataset.prov;
    const fields = document.querySelectorAll(`#partsList input[data-part="${partId}"][data-prov="${prov}"]`);
    const body = {};
    fields.forEach((f) => { body[f.dataset.field] = f.value; });
    await api.put(`/api/parts/${partId}/site/${prov}`, body);
    toast("Записано");
  }
});

// ---- machines ----
document.getElementById("machineForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = ["brand", "model", "serial", "type", "manualUrl", "notes"].reduce((o, k) => (o[k] = f[k].value.trim(), o), {});
  if (!body.brand && !body.model) return toast("Въведете марка или модел");
  await api.post("/api/machines", body);
  f.reset(); loadMachines(); toast("Машината е добавена");
});

async function loadMachines() {
  MACHINES = await api.get("/api/machines");
  const el = document.getElementById("machinesList");
  el.innerHTML = MACHINES.length
    ? MACHINES.map((m) => `<div class="item">
        <div class="row between">
          <div>
            <h3>${esc(`${m.brand} ${m.model}`.trim()) || "(без име)"}</h3>
            <div class="meta">${[m.type, m.serial && "Сер. № " + m.serial, m.notes].filter(Boolean).map(esc).join(" · ")}
            ${m.manualUrl ? ` · <a href="${esc(m.manualUrl)}" target="_blank" rel="noopener">ръководство ↗</a>` : ""}</div>
          </div>
          <button class="danger del-machine" data-id="${m.id}">Изтрий</button>
        </div>
      </div>`).join("")
    : '<p class="muted">Все още няма машини.</p>';
  fillMachineSelect();
}

function fillMachineSelect() {
  const sel = document.querySelector('#savePartForm select[name="machineId"]');
  sel.innerHTML = '<option value="">— свържи с машина (по избор) —</option>' +
    MACHINES.map((m) => `<option value="${m.id}">${esc(`${m.brand} ${m.model}`.trim())}</option>`).join("");
}

document.getElementById("machinesList").addEventListener("click", async (e) => {
  if (e.target.classList.contains("del-machine")) {
    if (!confirm("Да изтрия ли тази машина?")) return;
    await api.del("/api/machines/" + e.target.dataset.id); loadMachines(); toast("Изтрито");
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
          <input type="checkbox" data-field="enabled" ${p.enabled ? "checked" : ""} style="width:auto"/> активен
        </label>
      </div>
      <label>Шаблон за адрес на търсене (ползвайте {q} за търсената дума). Оставете празно за сайтове с режим форма.</label>
      <input data-field="searchTemplate" value="${esc(p.searchTemplate || "")}" />
      <label>Адрес на сайта и селектор на търсачката (режим форма: при липса на адрес за търсене)</label>
      <div class="row">
        <input data-field="siteUrl" value="${esc(p.siteUrl || "")}" placeholder="https://сайт/en" />
        <input data-field="searchInputSelector" value="${esc(p.searchInputSelector || "")}" placeholder="CSS на търсачката, напр. input[type=search]" />
      </div>
      <label>Селектор за цена (по избор, за автоматични цени)</label>
      <input data-field="priceSelector" value="${esc(p.priceSelector || "")}" placeholder="CSS селектор, напр. .product-price" />
      <label>Селектор за връзка към резултат (по избор)</label>
      <input data-field="linkSelector" value="${esc(p.linkSelector || "")}" placeholder="CSS селектор, напр. a.product-item-link" />
      <div class="row" style="margin-top:10px">
        <button class="small save-provider" data-id="${p.id}">Запис</button>
        <button class="small ghost login-provider" data-id="${p.id}">Вход (запази сесия)</button>
        <span class="badge ${p.hasAuth ? "" : "off"}">${p.hasAuth ? "сесията е запазена" : "няма сесия"}</span>
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
    toast("Записано"); loadProviders();
  } else if (e.target.classList.contains("login-provider")) {
    toast("Отваря се браузър — влезте и затворете прозореца");
    try {
      await api.post("/api/providers/" + id + "/login");
      toast("Сесията е запазена"); loadProviders();
    } catch (err) { toast(err.message); }
  }
});

// ---- init ----
(async function init() {
  try {
    PROVIDERS = await api.get("/api/providers");
    MACHINES = await api.get("/api/machines");
    fillMachineSelect();
    renderTiles();
  } catch (err) { toast("Няма връзка със сървъра: " + err.message); }
})();
