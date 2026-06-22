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
   - `WORKER_CHAT_ID` — optional. Fallback Telegram chat/group ID to
     forward `worker` tasks to when no per-worker registry entry exists
     yet. To get it: add the bot to the group, send any message, then
     check `https://api.telegram.org/bot<TOKEN>/getUpdates` for the
     `chat.id` (it's negative for groups).
   - `OWNER_CHAT_ID` — optional. Your own chat ID; if set, the bot notifies
     you here whenever a worker marks task(s) as done.
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
