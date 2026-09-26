# Position Sizer — Lot Size Calculator (PWA)

A mobile-installable lot size / position size calculator for **Forex, indices and commodities**,
inspired by the [Myfxbook position size calculator](https://www.myfxbook.com/forex-calculators/position-size).
Dark, amber-accented theme. Works fully **offline** once installed.

## What it does

- Risk-based position sizing: `lots = (balance × risk%) / (stop distance in pips × value per pip)`
- **Two input modes:** by entry/stop **price**, or by **stop distance in pips**
- Optional **target** → shows potential profit and reward:risk ratio
- Live **risk amount**, direction badge (long/short), value per pip, and contract units
- Lots are **rounded down** to 0.01 so the calculated risk is never exceeded
- Per-instrument defaults for pip size & value per pip, all **editable** to match your broker
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
