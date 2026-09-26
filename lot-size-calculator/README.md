# Lot Size Calculator (PWA)

A mobile-installable lot size / position size calculator for **Forex, crypto and commodities**.
Light, teal-accented theme with a **currency-pair builder** and a **stop-loss → lots table**.
Works fully **offline** once installed.

## What it does

- Risk-based position sizing: `lots = (balance × risk%) / (stop loss in pips × value per pip)`
- **Currency-pair builder:** FX (tap base then quote, e.g. AUD → CAD), Crypto and Commodity tabs
- **Stop-loss → lots table:** see the lot size across a range of stop losses at once; the current
  row is highlighted, and tapping any row makes it the current stop loss
- **Row step** control (1 / 5 / 10 pips) to widen or tighten the table
- Live **risk amount** in the header
- Lots are **rounded down** to 0.01 so the calculated risk is never exceeded
- Per-pair defaults for pip size & value per pip, all **editable** to match your broker
  (non-USD-quoted pairs use approximate default rates — confirm on your platform)
- Remembers your last inputs (localStorage)

## Install on your phone

The app is a **PWA** (Progressive Web App) — no app store needed.

1. Host the `lot-size-calculator/` folder over **HTTPS** (see below) and open the URL on your phone.
2. **Android / Chrome:** tap the **“Install app on this device”** button, or use ⋮ → *Install app / Add to Home screen*.
3. **iPhone / Safari:** tap the **Share** icon → **Add to Home Screen**.

It then launches full-screen from your home screen and runs offline.

## Hosting

Any static host works — the app is plain HTML/JS with no build step. A service worker
requires **HTTPS** (or `localhost`). Easy options:

- **GitHub Pages:** push this repo, enable Pages, and browse to `…/lot-size-calculator/`.
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop or point at this folder.
- **Local test:** `cd lot-size-calculator && python3 -m http.server 8000` → open `http://localhost:8000`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The whole app (UI, logic, styling) |
| `manifest.webmanifest` | PWA metadata (name, icons, theme) |
| `sw.js` | Service worker for offline caching |
| `icons/` | App icons (192/512 + maskable + Apple touch) |

## Accuracy note

Contract and point values differ between brokers, so **confirm the per-pip value against your
own platform before sizing live trades.** This tool is for education only and is not financial advice.
