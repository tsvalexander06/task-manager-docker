# Instagram DM Portal

A minimal, chats-only Instagram web client. It shows **only** your Direct
Message conversations — no feed, stories, or reels — so you can read and send
Instagram DMs from a browser (including Safari on your phone).

This started as an "iMessage ↔ Instagram" idea. A true iMessage bridge is not
possible here: iMessage has no API and every working bridge (BlueBubbles,
mautrix-imessage) requires a Mac running 24/7. With no Mac available, this is
the Instagram-only half of that idea.

## ⚠️ Read before using

This logs into a **personal** Instagram account through the unofficial private
API ([`instagrapi`](https://github.com/subzeroid/instagrapi)). That **violates
Instagram's Terms of Service** and Instagram may lock or ban the account —
especially since this runs from a server IP, which Instagram treats as
suspicious.

- **Use a secondary / throwaway account**, not your main one.
- The login session is saved to a Docker volume (`instagram_session`) and
  reused so you are not logging in fresh every time.

## Run it

From the repo root:

```bash
docker compose up --build instagram-dm
```

Then open <http://localhost:8000> and log in with your Instagram username and
password. If Instagram asks for a 2FA code, a code field appears — enter it and
log in again. If Instagram issues a security challenge, approve the login from
the real Instagram app, then retry.

## What works (MVP)

- Log in (with 2FA support) and stay logged in across restarts.
- List your DM conversations.
- Open a conversation and read recent messages.
- Send a text message; the thread refreshes to show it.

Not yet: live push of new messages (use the ⟳ refresh button), media/photos,
group-thread niceties, message reactions.

## API

| Method | Path                          | Purpose                     |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/api/status`                 | Are we logged in?           |
| POST   | `/api/login`                  | `{username, password, verification_code?}` |
| POST   | `/api/logout`                 | Clear session               |
| GET    | `/api/threads`                | List DM conversations       |
| GET    | `/api/threads/{id}`           | Messages in a conversation  |
| POST   | `/api/threads/{id}/send`      | `{text}` — send a message   |
