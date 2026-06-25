# Note bot

Telegram bot for capturing "хвърчащи бележки" — short notes (text, voice, or
a photo with a caption), e.g. "маса миене" — and turning them into
structured tasks. It also detects when a message means "create an OLX
listing for this machine" and switches into a separate listing-creation
flow that identifies the equipment from photos, drafts the listing, and
(after you confirm) publishes it to OLX.

## Task flow

1. Send the bot text, a voice message, or a photo (with an optional
   caption).
   - Voice messages are transcribed first (OpenAI `gpt-4o-mini-transcribe`).
   - Photos are saved to disk and attached to the task; the caption (or a
     default placeholder if there isn't one) is used as the note text.
2. Claude classifies intent. If it's not a listing request, it structures
   the note into `{ title, description, category, assigneeType, agentType,
   confidence, priority }`. `assigneeType` is `worker` if the task needs a
   person on-site, or `agent` if an AI agent could plausibly do it, with
   `agentType` describing what kind of agent (see `src/analyze.js` for the
   exact rules). `confidence` (0-100) reflects how sure Claude is that the
   chosen assignee/agent type is correct and fully actionable by an agent.
3. The task is saved via `POST /tasks` on the backend and the bot replies
   with a one-line confirmation (no full JSON dump).
4. If the task needs a worker (`assigneeType === "worker"`, or `agent` with
   `confidence` below 70), the bot asks you who should get it — tap a
   worker's name on the inline keyboard and the bot DMs that worker
   directly (with the photo, if any) and marks the task `in_progress`. If
   no workers are registered yet, it falls back to `WORKER_CHAT_ID` (if
   set) for `worker`-type tasks.
5. `/tasks` shows what's pending vs. done. `/done <id>` marks a task done.
   `/report` asks Claude for a short status digest (done / pending /
   suggestions to speed things up) instead of a raw list.
6. `/workers` lists registered workers. `/worker add <name> <chat id>
   [skills]` registers one — the worker must have started a chat with the
   bot first so it has a `chat id` to message them at.

## Equipment database

Each physical machine is tracked as it moves through its lifecycle:

```
received → servicing → ready → listed → sold
постъпила  в сервиз     готова   обявена  продадена
```

Machines enter and advance through this automatically — you don't maintain
it by hand:

- **From notes.** When a note concerns a specific machine, the analyze step
  extracts it (brand/model/name) and the bot finds-or-creates an equipment
  record. A note like `Foster и Electrolux миене` creates/links *two*
  machines. Matching is a fuzzy brand/model/name lookup that ignores
  already-sold units, so a later `Foster ремонт` reuses the same record
  instead of duplicating it — the bot tells you which machine it linked
  (`нова` vs `съществуваща`) so you can catch a wrong match. Wash/repair
  notes set the machine to `servicing`.
- **On task completion.** When a task tied to a machine is marked done (by
  you or a worker), that machine advances from `received`/`servicing` to
  `ready` (ready to list), and the owner is notified.
- **On listing.** When an OLX listing publishes, the machine is recorded
  (or the existing `ready` record updated) as `listed`, with its OLX link,
  price, and specs from the vision/research step — the data the listing
  flow used to throw away.
- **On sale.** `/sold <id>` marks a machine `sold`.

Query it with `/equipment` (everything, grouped by stage) or
`/equipment <status>` (e.g. `/equipment ready` to see what's washed/fixed
but not yet listed). Notes that aren't about a specific machine (e.g.
"маса миене") create no equipment record.

## Combining a follow-up note with an existing task

If a new message references an existing task by `#<id>` (e.g.
`#6 трябва да се грундира`), the bot doesn't create a new task — it appends
the rest of the message to that task's description and replies with a
short confirmation. If the task is already assigned to a worker, only the
*new addition* (not the whole combined description) is sent to that
worker's chat, so they aren't re-sent things they've already seen.

## Worker replies and completion tracking

Any chat ID registered via `/worker add` is treated as a worker's chat, not
the owner's — messages from it never get analyzed as new notes. Instead:

- Plain messages get a one-line "write 'готово' when you're done" nudge.
- A message matching common completion phrasing ("готово", "свърших",
  "приключих", "done", ...) triggers a check of that worker's open
  (non-`done`) assigned tasks:
  - **One open task** → marked done immediately, with confirmation back to
    the worker.
  - **Multiple open tasks** → the bot lists them and asks whether the
    worker is done with all of them or only some (reply "всички" or the
    specific `#id`s).
- If `OWNER_CHAT_ID` is set, the bot notifies that chat whenever a worker
  marks task(s) as done.

## Next-step and daily reminders

- Whenever a task whose title/category mentions washing/cleaning or
  repair-type keywords (миене, почистване, ремонт, поправка, фикс) gets
  marked done — by you via `/done` or by a worker confirming completion —
  the bot reminds you of the usual next steps for that kind of job: take
  photos, create the OLX listing, then hand the finished listing to the
  website engineer to upload there too. This is a static reminder, not an
  auto-created task, so it never gets buried in `/tasks`.
- If `OWNER_CHAT_ID` is set, once a day at `REMINDER_HOUR` (default `9`,
  server-local time) the bot sends you a digest of everything still
  pending — a lighter-weight nudge than `/report`, with no AI call. This
  digest now also lists equipment stuck at `ready` (washed/fixed but never
  photographed/listed), so forgetting to start a listing at all doesn't go
  unnoticed indefinitely — it resurfaces every day until the machine is
  listed.
- If you *do* start a listing (photos sent, or mid price/confirm step) and
  then go quiet, the bot checks every 15 minutes for sessions stalled more
  than `LISTING_STALL_HOURS` (default `3`) since their last activity, and
  sends a one-time nudge appropriate to where you left off (still waiting
  for photos, waiting for `/done`, waiting for a price, or waiting for `да`
  to confirm). It won't repeat the nudge again until you interact with the
  session (which resets the stall timer), so it's a single tap on the
  shoulder rather than a recurring spam.

## Listing flow

Triggered automatically when Claude detects listing intent in a text/voice
message, or in a photo's caption (see `src/intent.js`).

1. Bot enters "collecting photos" mode for that chat — send one or more
   photos of the machine, then `/done`.
2. Bot identifies the machine (`src/listing/vision.js`) and fills in
   missing specs via web search (`src/listing/research.js`).
3. Reply with the price (number, лв).
4. Bot shows the full draft listing (`src/listing/template.js`) — reply
   `да` to publish to OLX (`src/listing/olx.js`, via Playwright), or
   `/cancel` to abort.

This reuses the same logic as the original `telegram-bot` service — see
that service's README for the **known limitation on OLX selectors**
(unverified against a live session; run `npx playwright codegen
https://www.olx.bg` and update `src/listing/olx.js` before relying on
auto-publish).

While a listing session is active for a chat, all messages from that chat
go to the listing flow (not task capture) until `/done`'s result is
confirmed/published or `/cancel`'d.

## Architecture

- **Telegram** (Telegraf) — the only user-facing surface.
- **Anthropic Claude (`claude-sonnet-4-6`)** — intent classification
  (`src/intent.js`, listing vs. task), note structuring (`src/analyze.js`),
  status digests (`src/report.js`), and machine identification/spec
  enrichment for listings (`src/listing/vision.js`, `src/listing/research.js`,
  the latter using the `web_search_20250305` tool).
- **OpenAI `gpt-4o-mini-transcribe`** — voice note transcription. Optional;
  omitting `OPENAI_API_KEY` just disables voice support.
- **Playwright** — drives a real browser session to auto-publish listings to
  OLX.bg (`src/listing/olx.js`).
- **Backend REST API** — all persistence (tasks/workers/equipment) goes
  through the `backend` service; note-bot holds no direct DB connection. See
  `backend/README.md` for endpoints and schema.

## Commands

| Command | Does |
| --- | --- |
| `/start` | Greeting/intro. |
| `/cancel` | Aborts an in-progress listing session for that chat. |
| `/tasks` | Lists pending vs. done tasks. |
| `/done <id>` | Marks a task done; advances linked equipment, may trigger a next-step reminder. |
| `/report` | Claude-generated status digest (done/pending/suggestions). |
| `/workers` | Lists registered workers. |
| `/worker add <name> <chat id> [skills]` | Registers a worker (must have DM'd the bot first to have a chat id). |
| `/equipment [status]` | Lists machines, optionally filtered by lifecycle stage. |
| `/sold <id>` | Marks a machine `sold`. |

## State machines

Both are in-memory `Map`s keyed by chat ID — state does **not** survive a
restart/redeploy:

- **`listingSessions`** — `collecting_photos → processing → awaiting_price →
  awaiting_confirm`. While active for a chat, all messages from that chat go
  to the listing flow instead of task capture.
- **`workerSessions`** — `awaiting_completion_scope`, used when a worker has
  multiple open tasks and replies with a completion phrase; the bot needs to
  know whether they mean all of them or specific `#id`s.

## Deployment

`compose.yml` defines four services: `backend`, `db` (Postgres 16, with a
healthcheck gating `backend`'s startup), `note-bot`, and the legacy
`telegram-bot` (see Gaps & Risks below). Volumes: `postgres_data` (DB data),
`note_bot_photos` (mounted at `/app/photos` in `note-bot`).

### Railway

Each `compose.yml` service maps to its own Railway service. Cross-service
calls use Railway's private network: `http://<service-name>.railway.internal:<port>`.

Railway auto-injects its own `PORT` env var per service, which silently
overrides the app's `process.env.PORT || 3000` default — the backend may end
up listening on a Railway-assigned port like `8080` instead of `3000`. Check
the backend's deploy log line `Server running on port ___` and set
`BACKEND_URL` on `note-bot` to match that actual port, not an assumed
default. Monorepo services also need an explicit **Root Directory** (e.g.
`backend`, `note-bot`) and Dockerfile builder set in their Railway settings,
since auto-detection at the repo root won't find a single buildable target.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from BotFather.
   - `ANTHROPIC_API_KEY` — for note structuring, intent classification, and
     machine identification/research.
   - `OPENAI_API_KEY` — only needed if you want voice notes transcribed.
     Leave blank to skip voice support.
   - `OLX_EMAIL` / `OLX_PASSWORD` — only needed for the listing flow's
     auto-publish step.
   - `WORKER_CHAT_ID` — optional. Fallback Telegram chat/group ID to
     forward `worker` tasks to when no per-worker registry entry exists
     yet. To get it: add the bot to the group, send any message, then
     check `https://api.telegram.org/bot<TOKEN>/getUpdates` for the
     `chat.id` (it's negative for groups).
   - `OWNER_CHAT_ID` — optional. Your own chat ID; if set, the bot notifies
     you here whenever a worker marks task(s) as done, and sends the daily
     pending-tasks reminder.
   - `REMINDER_HOUR` — optional, default `9`. Hour (0-23, server-local
     time) the daily reminder is sent at, if `OWNER_CHAT_ID` is set.
   - `LISTING_STALL_HOURS` — optional, default `3`. How long a listing
     session can sit untouched (waiting for photos/`/done`/price/confirm)
     before the bot sends a one-time nudge to that chat.
2. `docker compose up --build note-bot backend db`

## Notes

- Photos are written to a Docker volume (`note_bot_photos`) mounted at
  `/app/photos` inside the container, and the task's `photo_path` points
  at that in-container path — it persists across restarts but isn't
  served over HTTP yet. Listing photos are deleted after the listing is
  published or cancelled.
- Still no Notion/n8n integration. Capture → structure → classify →
  (optionally) notify a worker chat or publish a listing.

## Gaps & Risks

- **`telegram-bot/` is fully redundant.** Its vision/research/olx/template
  logic is duplicated under `src/listing/` in this bot, which also adds
  automatic intent-based routing the old bot doesn't have. It's still
  defined as its own service/image in `compose.yml`; safe to remove once
  you're sure nothing external still points at it.
- **No automated tests.** Neither `note-bot/` nor `backend/` has any test
  coverage, and there's no CI workflow in the repo.
- **No formal DB migrations.** The schema is grown via idempotent
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`
  statements run on every boot (see `backend/README.md`). Fine for additive
  changes; doesn't support renames, drops, or data backfills.
- **Leaked-credential history.** Commit `ea75ab9` committed real secrets
  into `.env.example` (removed later in `2e0a0be`, but still present in git
  history). The Telegram bot token has since been rotated. **Anthropic API
  key rotation is still unconfirmed** — rotate it if it hasn't been.
- **Railway `PORT` brittleness.** Railway auto-injects its own `PORT` per
  service, which can silently override the app's own default — see the
  Deployment section above. Any dependent service's `BACKEND_URL` needs to
  track the backend's *actual* assigned port.
- **Session state persistence.** `listingSessions` and `workerSessions` are
  in-memory `Map`s, but every mutation is mirrored to the backend's
  `bot_sessions` table (`GET/PUT/DELETE /sessions`), and on startup the bot
  reloads all persisted rows before calling `bot.launch()`. An in-progress
  listing or worker completion flow now survives a restart/redeploy. Note
  that listing sessions store photo data as base64 inside the JSONB state
  blob (not just file paths), so they stay restorable even on Railway's
  ephemeral filesystem — the tradeoff is that a stalled listing session can
  leave a non-trivial JSONB row in `bot_sessions` until it's completed or
  cancelled.
