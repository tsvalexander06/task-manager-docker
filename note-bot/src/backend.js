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
  photoPath
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
      photoPath
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

module.exports = {
  createTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  listWorkers,
  createWorker
};
