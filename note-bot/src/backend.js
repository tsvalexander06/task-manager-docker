const BACKEND_URL = process.env.BACKEND_URL || "http://backend:3000";

async function createTask({
  title,
  description,
  category,
  assigneeType,
  agentType,
  confidence,
  priority,
  rawNote,
  photoPath,
  equipmentId,
  chatId,
  remindAt
}) {
  const res = await fetch(`${BACKEND_URL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description,
      category,
      assigneeType,
      agentType,
      confidence,
      priority,
      rawNote,
      photoPath,
      equipmentId,
      chatId,
      remindAt
    })
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function listTasks(status) {
  const url = status ? `${BACKEND_URL}/tasks?status=${status}` : `${BACKEND_URL}/tasks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function updateTask(id, fields) {
  const res = await fetch(`${BACKEND_URL}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function updateTaskStatus(id, status) {
  return updateTask(id, { status });
}

async function deleteTask(id) {
  const res = await fetch(`${BACKEND_URL}/tasks/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Backend error: ${res.status}`);
}

async function deleteAllTasks() {
  const res = await fetch(`${BACKEND_URL}/tasks`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function listWorkers() {
  const res = await fetch(`${BACKEND_URL}/workers`);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function createWorker({ name, telegramChatId, skills }) {
  const res = await fetch(`${BACKEND_URL}/workers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, telegramChatId, skills })
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function listEquipment({ status, match } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (match) params.set("match", match);
  const qs = params.toString();
  const res = await fetch(`${BACKEND_URL}/equipment${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function getEquipment(id) {
  const res = await fetch(`${BACKEND_URL}/equipment/${id}`);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function createEquipment(fields) {
  const res = await fetch(`${BACKEND_URL}/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function updateEquipment(id, fields) {
  const res = await fetch(`${BACKEND_URL}/equipment/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function deleteEquipment(id) {
  const res = await fetch(`${BACKEND_URL}/equipment/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Backend error: ${res.status}`);
}

async function listSessions(kind) {
  const url = kind ? `${BACKEND_URL}/sessions?kind=${kind}` : `${BACKEND_URL}/sessions`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function saveSession(chatId, kind, state) {
  const res = await fetch(`${BACKEND_URL}/sessions/${chatId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, state })
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

async function deleteSession(chatId) {
  const res = await fetch(`${BACKEND_URL}/sessions/${chatId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Backend error: ${res.status}`);
}

module.exports = {
  createTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  deleteTask,
  deleteAllTasks,
  listWorkers,
  createWorker,
  listEquipment,
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  listSessions,
  saveSession,
  deleteSession
};
