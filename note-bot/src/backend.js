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
  equipmentId
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
      equipmentId
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

module.exports = {
  createTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  listWorkers,
  createWorker,
  listEquipment,
  getEquipment,
  createEquipment,
  updateEquipment
};
