# Note bot

Telegram bot for capturing "хвърчащи бележки" — short free-text notes (e.g.
"маса миене") — and turning them into structured tasks stored via the
existing `backend` API.

## Flow

1. Send the bot any text message that isn't a command.
2. It asks Claude to structure the note into `{ title, description,
   category, assigneeType, priority }`. `assigneeType` is `worker` if the
   task needs a person on-site, or `agent` if an AI agent could plausibly
   do it (see `src/analyze.js` for the exact rules).
3. The task is saved via `POST /tasks` on the backend and the bot replies
   with a one-line confirmation (no full JSON dump).
4. `/tasks` shows what's pending vs. done. `/done <id>` marks a task done.

## Setup

1. Copy `.env.example` to `.env` and fill in `TELEGRAM_BOT_TOKEN` and
   `ANTHROPIC_API_KEY` (a separate bot token from the OLX listing bot is
   recommended, but not required).
2. `docker compose up --build note-bot`

## Notes

- This is intentionally minimal — no Notion/n8n integration yet, no
  per-worker routing/notifications. It's the base described in the larger
  AI-ecosystem spec: capture → structure → classify. Routing the
  "worker" tasks to an actual person/channel is a follow-up step.
