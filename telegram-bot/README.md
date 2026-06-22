# OLX listing bot

Telegram bot that turns photos of professional kitchen equipment into an OLX
listing: identifies the machine from its nameplate, fills in missing specs
via web search, drafts the listing text from a fixed template, and (after
you confirm) posts it to OLX via browser automation.

## Flow

1. Send the bot one or more photos of the machine.
2. Send `/done`.
3. Bot identifies brand/model/specs and replies with what it found.
4. Reply with the price (number, лв).
5. Bot shows the full draft listing — reply `да` to publish, or `/cancel` to abort.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `ANTHROPIC_API_KEY` — for photo identification + web research
   - `OLX_EMAIL` / `OLX_PASSWORD` — your OLX account credentials
2. `docker compose up --build telegram-bot`

## Known limitation: OLX selectors

`src/olx.js` contains the CSS selectors used to log in and fill out the OLX
"new listing" form. These were not verified against a live OLX session (no
test account was available while building this). Before relying on
auto-posting:

1. Run `npx playwright codegen https://www.olx.bg` locally, log in and create
   a test listing by hand — Playwright will print the actual selectors it
   sees.
2. Update the `SELECTORS` object in `src/olx.js` to match.
3. Also watch for CAPTCHA/2FA on login — if OLX shows one, this script can't
   solve it and the run will fail; you may need to keep a long-lived
   authenticated browser session instead of logging in fresh each time.

## Notes

- Sessions are in-memory and per Telegram chat; restarting the bot loses any
  in-progress draft.
- The listing template (`src/template.js`) matches the existing
  konvektomat.store format. Edit it there if the format changes.
