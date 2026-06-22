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
    priority = "normal",
    rawNote = null
  } = req.body;
  const result = await pool.query(
    `INSERT INTO tasks (title, description, category, assignee_type, priority, raw_note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title, description, category, assigneeType, priority, rawNote]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await pool.query(
    "UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Task not found" });
  res.json(result.rows[0]);
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
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS raw_note TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
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
