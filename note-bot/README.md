# Note bot

Telegram bot for capturing "хвърчащи бележки" — short notes (text, voice, or
a photo with a caption), e.g. "маса миене" — and turning them into
structured tasks stored via the existing `backend` API.

## Flow

1. Send the bot text, a voice message, or a photo (with an optional
   caption).
   - Voice messages are transcribed first (OpenAI Whisper).
   - Photos are saved to disk and attached to the task; the caption (or a
     default placeholder if there isn't one) is used as the note text.
2. Claude structures the note into `{ title, description, category,
   assigneeType, priority }`. `assigneeType` is `worker` if the task needs
   a person on-site, or `agent` if an AI agent could plausibly do it (see
   `src/analyze.js` for the exact rules).
3. The task is saved via `POST /tasks` on the backend and the bot replies
   with a one-line confirmation (no full JSON dump).
4. If `assigneeType` is `worker` and `WORKER_CHAT_ID` is set, the bot also
   forwards the task (with the photo, if any) to that chat.
5. `/tasks` shows what's pending vs. done. `/done <id>` marks a task done.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from BotFather (a separate token from the OLX
     listing bot is recommended, but not required).
   - `ANTHROPIC_API_KEY` — for note structuring.
   - `OPENAI_API_KEY` — only needed if you want voice notes transcribed
     (uses Whisper). Leave blank to skip voice support.
   - `WORKER_CHAT_ID` — optional. The Telegram chat/group ID to forward
     `worker` tasks to. To get it: add the bot to the group, send any
     message, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`
     for the `chat.id` (it's negative for groups).
2. `docker compose up --build note-bot backend db`

## Notes

- Photos are written to a Docker volume (`note_bot_photos`) mounted at
  `/app/photos` inside the container, and the task's `photo_path` points
  at that in-container path — it persists across restarts but isn't
  served over HTTP yet.
- This is intentionally still a base — no Notion/n8n integration. Capture
  → structure → classify → (optionally) notify a worker chat.
