const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "taskdb",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres"
});

app.get("/", (req, res) => {
  res.json({ message: "Task Manager API is running" });
});

app.get("/tasks", async (req, res) => {
  const { status } = req.query;
  const result = status
    ? await pool.query("SELECT * FROM tasks WHERE status = $1 ORDER BY id", [status])
    : await pool.query("SELECT * FROM tasks ORDER BY id");
  res.json(result.rows);
});

app.post("/tasks", async (req, res) => {
  const {
    title,
    description = null,
    category = null,
    assigneeType = "worker",
    agentType = null,
    confidence = null,
    priority = "normal",
    rawNote = null,
    photoPath = null,
    equipmentId = null
  } = req.body;
  const result = await pool.query(
    `INSERT INTO tasks (title, description, category, assignee_type, agent_type, confidence, priority, raw_note, photo_path, equipment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [title, description, category, assigneeType, agentType, confidence, priority, rawNote, photoPath, equipmentId]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { status, assignedTo, description, equipmentId } = req.body;

  const sets = [];
  const values = [];
  let i = 1;

  if (status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(status);
  }
  if (assignedTo !== undefined) {
    sets.push(`assigned_to = $${i++}`);
    values.push(assignedTo);
  }
  if (description !== undefined) {
    sets.push(`description = $${i++}`);
    values.push(description);
  }
  if (equipmentId !== undefined) {
    sets.push(`equipment_id = $${i++}`);
    values.push(equipmentId);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Task not found" });
  res.json(result.rows[0]);
});

app.get("/workers", async (req, res) => {
  const result = await pool.query("SELECT * FROM workers ORDER BY id");
  res.json(result.rows);
});

app.post("/workers", async (req, res) => {
  const { name, telegramChatId, skills = null } = req.body;
  const result = await pool.query(
    "INSERT INTO workers (name, telegram_chat_id, skills) VALUES ($1, $2, $3) RETURNING *",
    [name, telegramChatId, skills]
  );
  res.status(201).json(result.rows[0]);
});

// Equipment: each physical machine that moves through
// received -> servicing -> ready -> listed -> sold.
app.get("/equipment", async (req, res) => {
  const { status, match } = req.query;
  const where = [];
  const values = [];
  let i = 1;
  if (status) {
    where.push(`status = $${i++}`);
    values.push(status);
  }
  if (match) {
    // Fuzzy lookup used to dedupe before creating a new record; never
    // matches machines already sold.
    where.push(`status <> 'sold'`);
    where.push(`(name ILIKE $${i} OR brand ILIKE $${i} OR model ILIKE $${i})`);
    values.push(`%${match}%`);
    i++;
  }
  const sql = `SELECT * FROM equipment${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
  const result = await pool.query(sql, values);
  res.json(result.rows);
});

app.get("/equipment/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM equipment WHERE id = $1", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
  res.json(result.rows[0]);
});

app.post("/equipment", async (req, res) => {
  const {
    name,
    brand = null,
    model = null,
    category = null,
    condition = null,
    specs = null,
    status = "received",
    price = null,
    olxUrl = null,
    photoPaths = null
  } = req.body;
  const result = await pool.query(
    `INSERT INTO equipment (name, brand, model, category, condition, specs, status, price, olx_url, photo_paths)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [name, brand, model, category, condition, specs, status, price, olxUrl, photoPaths]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/equipment/:id", async (req, res) => {
  const { id } = req.params;
  const fields = {
    name: "name",
    brand: "brand",
    model: "model",
    category: "category",
    condition: "condition",
    specs: "specs",
    status: "status",
    price: "price",
    olxUrl: "olx_url",
    photoPaths: "photo_paths"
  };
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, column] of Object.entries(fields)) {
    if (req.body[key] !== undefined) {
      sets.push(`${column} = $${i++}`);
      values.push(req.body[key]);
    }
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE equipment SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
  res.json(result.rows[0]);
});

app.delete("/equipment/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM equipment WHERE id = $1 RETURNING *", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
  res.status(204).end();
});

// Per-chat bot session state (listing/worker-completion flows), persisted so
// it survives a bot restart/redeploy instead of living only in memory.
app.get("/sessions", async (req, res) => {
  const { kind } = req.query;
  const result = kind
    ? await pool.query("SELECT * FROM bot_sessions WHERE kind = $1", [kind])
    : await pool.query("SELECT * FROM bot_sessions");
  res.json(result.rows);
});

app.get("/sessions/:chatId", async (req, res) => {
  const result = await pool.query("SELECT * FROM bot_sessions WHERE chat_id = $1", [req.params.chatId]);
  if (result.rows.length === 0) return res.status(404).json({ error: "Session not found" });
  res.json(result.rows[0]);
});

app.put("/sessions/:chatId", async (req, res) => {
  const { kind, state } = req.body;
  const result = await pool.query(
    `INSERT INTO bot_sessions (chat_id, kind, state, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chat_id) DO UPDATE SET kind = $2, state = $3, updated_at = now()
     RETURNING *`,
    [req.params.chatId, kind, state]
  );
  res.json(result.rows[0]);
});

app.delete("/sessions/:chatId", async (req, res) => {
  await pool.query("DELETE FROM bot_sessions WHERE chat_id = $1", [req.params.chatId]);
  res.status(204).end();
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type TEXT NOT NULL DEFAULT 'worker'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_type TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS raw_note TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS photo_path TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS equipment_id INTEGER`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      telegram_chat_id TEXT NOT NULL,
      skills TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      category TEXT,
      condition TEXT,
      specs JSONB,
      status TEXT NOT NULL DEFAULT 'received',
      price NUMERIC,
      olx_url TEXT,
      photo_paths TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log("Database connected");
}

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1);
  });
