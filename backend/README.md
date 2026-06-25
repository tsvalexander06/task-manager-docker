# Backend

Express + Postgres REST API shared by `note-bot` (and the legacy
`telegram-bot`). Owns all persistence — neither bot talks to Postgres
directly.

## Endpoints

### Tasks

- `GET /tasks` — `?status=` optional filter. Returns all columns.
- `POST /tasks` — body: `title` (required), `description`, `category`,
  `assigneeType` (`worker`|`agent`, default `worker`), `agentType`,
  `confidence` (0-100), `priority` (default `normal`), `rawNote`,
  `photoPath`, `equipmentId`, `chatId` (Telegram chat the note came from),
  `remindAt` (Sofia-local `"YYYY-MM-DDTHH:mm:ss"` string, no timezone — see
  below; only set for `agentType: "reminder"` tasks with a concrete time).
- `PATCH /tasks/:id` — body: any of `status`, `assignedTo`, `description`,
  `equipmentId`. Updates `updated_at`.

### Workers

- `GET /workers` — all registered workers.
- `POST /workers` — body: `name`, `telegramChatId`, `skills`.

### Equipment

Tracks each physical machine through `received → servicing → ready → listed
→ sold`.

- `GET /equipment` — `?status=` filter, `?match=` fuzzy `ILIKE` lookup
  against `name`/`brand`/`model` (used to dedupe before creating a new
  record; always excludes `sold` machines).
- `GET /equipment/:id`
- `POST /equipment` — body: `name` (required), `brand`, `model`, `category`,
  `condition`, `specs`, `status` (default `received`), `price`, `olxUrl`,
  `photoPaths`.
- `PATCH /equipment/:id` — body: any of `name`, `brand`, `model`, `category`,
  `condition`, `specs`, `status`, `price`, `olxUrl`, `photoPaths`.
- `DELETE /equipment/:id` — deletes the row outright (`204`). No FK
  constraint to `tasks.equipment_id`, so any task still pointing at the
  deleted id is left untouched.

### Health

- `GET /` — `{ message: "Task Manager API is running" }`.

## Schema

No migration tool — `initDb()` runs `CREATE TABLE IF NOT EXISTS` plus
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column on every boot, so
schema changes are additive-only by convention.

- **tasks** — `id`, `title`, `description`, `category`, `assignee_type`
  (default `worker`), `agent_type`, `confidence`, `priority` (default
  `normal`), `status` (default `pending`), `raw_note`, `photo_path`,
  `assigned_to`, `equipment_id`, `chat_id`, `remind_at` (`TEXT`, not
  `TIMESTAMPTZ` — deliberately a naive Sofia-local string so Postgres never
  reinterprets it against a different session timezone), `created_at`,
  `updated_at`.
- **workers** — `id`, `name`, `telegram_chat_id`, `skills`, `created_at`.
- **equipment** — `id`, `name`, `brand`, `model`, `category`, `condition`,
  `specs` (jsonb), `status` (default `received`), `price`, `olx_url`,
  `photo_paths`, `created_at`, `updated_at`.

## Config

| Env var | Default |
| --- | --- |
| `DB_HOST` | `db` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `taskdb` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `postgres` |
| `PORT` | `3000` |

On Railway (or any platform that auto-injects its own `PORT`), the app
listens on whatever `PORT` ends up set to — check the deploy log line
`Server running on port ___` and point any dependent service's `BACKEND_URL`
at that actual port, not an assumed `3000`.

## Running it

```
docker compose up --build backend db
```
