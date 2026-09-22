// Minimal Instagram DM client frontend.
// Talks to the FastAPI JSON endpoints in app/main.py.

const $ = (sel) => document.querySelector(sel);

const state = {
  me: null,
  activeThread: null,
};

// ---- helpers ----------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* no body */
  }
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : { message: res.statusText };
    const err = new Error(detail.message || "Request failed");
    err.code = detail.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

function show(view) {
  $("#login-view").classList.toggle("hidden", view !== "login");
  $("#chat-view").classList.toggle("hidden", view !== "chat");
}

// ---- login ------------------------------------------------------------

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  const errBox = $("#login-error");
  errBox.textContent = "";
  btn.disabled = true;
  btn.textContent = "Logging in…";

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#username").value.trim(),
        password: $("#password").value,
        verification_code: $("#verification_code").value.trim() || null,
      }),
    });
    await enterChat();
  } catch (err) {
    if (err.code === "2fa_required") {
      $("#verification_code").classList.remove("hidden");
      $("#verification_code").focus();
      errBox.textContent = "Enter your 2FA code and log in again.";
    } else {
      errBox.textContent = err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  state.me = null;
  state.activeThread = null;
  show("login");
});

$("#refresh-btn").addEventListener("click", loadThreads);

// ---- threads ----------------------------------------------------------

async function enterChat() {
  show("chat");
  await loadThreads();
}

async function loadThreads() {
  const listEl = $("#thread-list");
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const data = await api("/api/threads");
    state.me = data.me;
    $("#me-label").textContent = "DMs";
    if (!data.threads.length) {
      listEl.innerHTML = '<div class="empty">No conversations yet.</div>';
      return;
    }
    listEl.innerHTML = "";
    data.threads.forEach((t) => {
      const el = document.createElement("div");
      el.className = "thread";
      el.dataset.id = t.thread_id;
      el.innerHTML = `<div class="title"></div><div class="preview"></div>`;
      el.querySelector(".title").textContent = t.title;
      el.querySelector(".preview").textContent = t.last_message || "";
      el.addEventListener("click", () => openThread(t.thread_id, t.title, el));
      listEl.appendChild(el);
    });
  } catch (err) {
    if (err.status === 401) return show("login");
    listEl.innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

// ---- messages ---------------------------------------------------------

async function openThread(threadId, title, el) {
  state.activeThread = threadId;
  document.querySelectorAll(".thread").forEach((t) => t.classList.remove("active"));
  if (el) el.classList.add("active");
  $("#chat-header").textContent = title;
  $("#send-form").classList.remove("hidden");
  $("#chat-view").classList.add("show-chat");
  await loadMessages(threadId);
}

async function loadMessages(threadId) {
  const box = $("#messages");
  box.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const data = await api(`/api/threads/${threadId}`);
    box.innerHTML = "";
    data.messages.forEach((m) => {
      const b = document.createElement("div");
      b.className = "bubble " + (m.is_me ? "me" : "them");
      b.textContent = m.text;
      box.appendChild(b);
    });
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    if (err.status === 401) return show("login");
    box.innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

$("#send-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#message-input");
  const text = input.value.trim();
  if (!text || !state.activeThread) return;
  input.value = "";
  try {
    await api(`/api/threads/${state.activeThread}/send`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await loadMessages(state.activeThread);
  } catch (err) {
    if (err.status === 401) return show("login");
    alert(err.message);
    input.value = text;
  }
});

// ---- boot -------------------------------------------------------------

(async function init() {
  try {
    const s = await api("/api/status");
    if (s.logged_in) {
      await enterChat();
    } else {
      show("login");
    }
  } catch (_) {
    show("login");
  }
})();
