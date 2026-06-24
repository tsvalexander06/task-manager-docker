# Feature board

Checklist of everything the system currently does, grouped by area. Check
items off, delete rows you don't want, or add new ones as you decide what to
keep/change. This is a living tracking doc, not a description of how things
work — see `note-bot/README.md` and `backend/README.md` for that.

## Note capture

- [x] Capture a task from plain text
- [x] Capture a task from a voice message (transcribed via OpenAI)
- [x] Capture a task from a photo + caption
- [x] Auto-classify intent: task vs. "create an OLX listing"
- [x] Combine a follow-up note into an existing task via `#<id>`

## Task management

- [x] `/tasks` — list pending/done
- [x] `/done <id>` — mark a task done
- [x] `/report` — AI-generated status digest
- [x] Auto-assign to a worker (inline keyboard) when needed
- [x] Fallback to `WORKER_CHAT_ID` if no worker registry entry matches

## Worker management

- [x] `/workers` — list registered workers
- [x] `/worker add <name> <chat id> [skills]` — register a worker
- [x] Detect worker "done" replies (готово/свърших/приключих/done/finish)
- [x] Handle one open task vs. multiple open tasks on completion
- [x] Notify owner (`OWNER_CHAT_ID`) when a worker completes task(s)

## Equipment lifecycle

- [x] Auto-create/link equipment records from notes (fuzzy dedupe)
- [x] Advance `received`/`servicing` → `ready` on task completion
- [x] Advance → `listed` when an OLX listing publishes
- [x] `/sold <id>` — mark a machine sold
- [x] `/equipment [status]` — query by lifecycle stage

## Reminders

- [x] Next-step reminder after wash/repair tasks complete (photos → listing → website)
- [x] Daily pending-tasks digest at `REMINDER_HOUR` (if `OWNER_CHAT_ID` set)

## Listing flow (OLX)

- [x] Auto-trigger from detected listing intent
- [x] Multi-photo collection mode (`/done` to finish)
- [x] Machine identification from photos (Claude vision)
- [x] Spec enrichment via web search
- [x] Price prompt + draft preview
- [x] Auto-publish to OLX via Playwright
- [ ] Verified OLX selectors (currently unverified against a live session —
      see `src/listing/olx.js`)

## Infra / ops

- [x] Docker Compose stack (backend, db, note-bot, legacy telegram-bot)
- [x] Postgres healthcheck gating backend startup
- [x] Deployed on Railway
- [ ] Remove redundant `telegram-bot` service
- [ ] Automated tests
- [ ] CI workflow
- [ ] Formal DB migrations (currently additive `ALTER TABLE` on boot)
- [ ] Confirm Anthropic API key was rotated (Telegram token already rotated)
- [ ] Clean up stray `OWNER_CHAT_ID=` duplicate variable on Railway note-bot service
- [ ] Photos served over HTTP (currently in-container path only)
