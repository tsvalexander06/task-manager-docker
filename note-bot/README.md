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
   the note into `{ title, description, category, assigneeType, priority }`.
   `assigneeType` is `worker` if the task needs a person on-site, or
   `agent` if an AI agent could plausibly do it (see `src/analyze.js` for
   the exact rules).
3. The task is saved via `POST /tasks` on the backend and the bot replies
   with a one-line confirmation (no full JSON dump).
4. If `assigneeType` is `worker` and `WORKER_CHAT_ID` is set, the bot also
   forwards the task (with the photo, if any) to that chat.
5. `/tasks` shows what's pending vs. done. `/done <id>` marks a task done.

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

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from BotFather.
   - `ANTHROPIC_API_KEY` — for note structuring, intent classification, and
     machine identification/research.
   - `OPENAI_API_KEY` — only needed if you want voice notes transcribed.
     Leave blank to skip voice support.
   - `OLX_EMAIL` / `OLX_PASSWORD` — only needed for the listing flow's
     auto-publish step.
   - `WORKER_CHAT_ID` — optional. The Telegram chat/group ID to forward
     `worker` tasks to. To get it: add the bot to the group, send any
     message, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`
     for the `chat.id` (it's negative for groups).
2. `docker compose up --build note-bot backend db`

## Notes

- Photos are written to a Docker volume (`note_bot_photos`) mounted at
  `/app/photos` inside the container, and the task's `photo_path` points
  at that in-container path — it persists across restarts but isn't
  served over HTTP yet. Listing photos are deleted after the listing is
  published or cancelled.
- The separate `telegram-bot` service is now redundant — this bot absorbs
  its listing-creation logic. It's left in the repo for now; let me know
  if you want it removed.
- Still no Notion/n8n integration. Capture → structure → classify →
  (optionally) notify a worker chat or publish a listing.
