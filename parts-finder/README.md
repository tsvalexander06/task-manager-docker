# Parts Finder

A small **local** tool for a catering-equipment maintenance team: identify a
machine, then find and compare the same spare part across your supplier sites
(REPA/GEV, REPA/LF, Professional Spares, Parts Town) without hunting through
each one by hand.

It runs entirely on your own computer. Nothing is uploaded anywhere, and your
supplier logins stay on your machine.

## What it does today

- **One-click search across all suppliers.** Type an OEM/part number, a model,
  or a keyword and it opens the matching search on every enabled supplier at
  once. No more navigating four sites separately.
- **A parts catalog that remembers.** Save a part once (name + OEM number +
  which machine it's for). Next time you need it, its per-supplier links and
  the last price you recorded are already there — this is how you beat the
  "every site uses a different number" problem: you record the match once.
- **A price-comparison worksheet.** For each saved part, keep each supplier's
  price and link side by side.
- **Machines.** Record your machines by brand / model / serial, with a link to
  the manual or parts diagram.
- **Optional auto-fetch (beta).** Where a site allows it, read the first
  result's price automatically. See below — this is the fragile part and needs
  a little setup per site.

> The honest limitation: the supplier sites are business accounts with prices
> behind a login and no public price API, so fully automatic price reading is
> best-effort and may need occasional adjusting when a site changes. The
> one-click search + worksheet always works.

## Run it

### Option A — Node directly (recommended; enables auto-fetch & login)

```bash
cd parts-finder
npm install
npm start
# open http://localhost:8080
```

To enable optional auto-fetch:

```bash
npm run fetch:install-browser   # installs a Chromium for Playwright
```

### Option B — Docker (core app only, no auto-fetch)

```bash
cd parts-finder
docker compose up --build
# open http://localhost:8080
```

## First-time setup (2 minutes)

1. Open the app → **Settings**.
2. For each supplier, fix the **Search URL template**: go to that site, search
   for any part number, copy the address bar, and paste it in — replacing the
   number you typed with `{q}`. Example:
   `https://www.example.com/search?q=60135` → `https://www.example.com/search?q={q}`
3. Save. Now the **Search** tab's one-click buttons work for every site.

That's the whole core. The catalog and worksheet work immediately.

## Optional: auto-fetch prices

For sites where you want prices read automatically:

1. **Log in once.** Settings → **Log in (save session)** for that supplier. A
   browser window opens; sign in by hand (handle any cookie banner), then close
   the window. The session is saved locally to `data/auth/` — **we never store
   your password.**
2. **Set the price selector.** On a search-results page, right-click the price
   → Inspect, and copy a CSS selector into the supplier's **Price selector**
   field (and optionally a **Result link selector**). Save.
3. On the Search tab, enter a part number and click **Auto-fetch**.

If a result is blank, it just means that site needs its URL/selector set or a
login — the one-click search still works meanwhile.

## Your data

Everything lives in `parts-finder/data/`:

- `store.json` — your machines, parts, prices, and supplier settings.
- `auth/` — saved login sessions (treat like passwords).

Both are git-ignored and never leave your machine. Back up `store.json` to keep
your catalog.

## Roadmap ideas

- Import parts from a supplier's exploded parts diagram.
- Per-site login automation for the sites that allow it.
- Export a comparison / order sheet to CSV.
