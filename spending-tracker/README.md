# Was It Worth It — Spending Tracker

A dead-simple, phone-first spending tracker built around one question: **was this purchase worth it?**

Every time you spend, you log it in a couple of taps and tag it as one of three buckets:

- ✅ **Necessity** — you actually needed it
- 🤔 **Want** — a treat, no regrets required
- 💀 **Stupid buy** — money you probably shouldn't have spent

Then the **Insights** tab shows you, front and center, exactly how much you've wasted on stupid shit this week / month / all time — so it's hard to lie to yourself.

## Features

- **Fast logging** — big amount keypad, three bucket buttons, optional note + category. Two taps and done.
- **History** — everything you've logged, grouped by day, filterable by bucket. Swipe-free delete with one-tap **Undo**.
- **Insights** — a "stupid spending" hero number, a Need/Want/Stupid split bar, a 7-day chart, and quick stats (avg per spend, % wasted, biggest spend).
- **Private** — all data lives in your browser's `localStorage`. Nothing is sent anywhere.
- **Backup / restore** — export your data to a JSON file and import it back (e.g. on a new phone).
- **Currency picker** — $, €, £, ¥, ₹, ₽ and more.
- **Installable PWA** — add to your home screen and it works fully **offline**.

## Run it

It's a static site — no build step, no backend.

```bash
# from the repo root
cd spending-tracker
python3 -m http.server 8080
# then open http://localhost:8080 on your phone or browser
```

Or just open `index.html` directly in a browser. To install on a phone, serve it over HTTPS (or localhost), open it in the browser, and choose **Add to Home Screen**.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The entire app — UI, logic and styles, self-contained. |
| `manifest.webmanifest` | PWA metadata (name, icons, theme). |
| `sw.js` | Service worker: network-first for app code, cache for offline. |
| `icons/` | App icons (regular + maskable + Apple touch). |

## Data model

Each logged spend is stored as:

```json
{ "id": "…", "amount": 12.5, "bucket": "stupid", "note": "Impulse hoodie", "cat": "Shopping", "ts": 1700000000000 }
```

`bucket` is one of `need`, `want`, `stupid`.
