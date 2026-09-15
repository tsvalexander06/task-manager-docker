# Use it yourself, for nothing

No Supabase. No Stripe. No domain. No email provider. Nothing to sign up for
and nothing to pay, for as long as you want.

This is the right mode while you are testing the journal on your own trading and
still building it for other people. Publishing is a separate decision you can
take later without redoing any of this.

---

## Why there is nothing to pay

The subscription only exists when accounts exist.

`config.js` carries the Supabase URL and key. Leave them blank and the journal
stores everything in your browser's IndexedDB, the paywall never appears, and
the Subscription card hides itself. That is not a trial or a crippled mode — in
the code it is a separate state:

```js
/* Billing only applies when there are accounts at all. Running on this device
   with no Supabase configured is the local mode, not an unpaid one. */
function billingApplies(){ return Store.backend==='supabase'; }
```

The repository's `config.js` is already blank. You do not have to change
anything to get this.

---

## Run it

```bash
cd journal
npx http-server -p 8080 .     # or: python3 -m http.server 8080
```

Open <http://localhost:8080>.

You can also just double-click `index.html`. It works, but each origin has its
own storage, so a journal opened from a file and a journal opened from
`localhost` are two different journals that cannot see each other. Pick one way
and stay with it.

Everything works offline except the charts, which load from a CDN.

**Do not point this at your Supabase project.** The moment `config.js` has a URL
in it you are back to magic-link sign-in, and a broken email provider locks you
out of your own journal.

---

## The one rule

Your journal lives in one browser profile on one machine. The automatic restore
points in Settings are real and they work, but **they are stored in the same
IndexedDB as the journal**. They will save you from a bad edit. They will not
save you from clearing site data, a browser reinstall, or a dead laptop — that
takes the journal and every restore point with it.

So: **Settings → Download a backup file**, and put it somewhere that is not this
machine.

The journal now keeps track of this for you:

- Settings shows **Copy saved off this device** — Never, Today, or how many days
  ago, in the accent colour once it is over a week old.
- If it has been more than seven days and you have trades logged, you get one
  reminder a day. Once a day, not once a reload.

Neither appears when an account is syncing your journal to a server, because
then it is someone else's problem.

Backups include your screenshots when you use **Download a backup file**. To
restore one: drop the file anywhere on the page, or Settings → Restore from a
file.

---

## What you do not get

| | Local | With an account |
|---|---|---|
| Cost | Nothing | Supabase + email provider |
| Sign-in | None | Magic link by email |
| Devices | One browser, one machine | Any browser you sign in from |
| If you clear site data | Gone, unless you have a file | Fine |
| Screenshots | In the browser, in your backups | Supabase Storage |
| Paywall | Never appears | Appears without a subscription |

Everything else — every tab, every chart, screenshots, the playbook, market
prep, weekly reviews, the SMC test record — is identical. You are not testing a
reduced version of the product.

---

## When you do want to publish

Nothing here is throwaway work.

1. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Netlify. The build prints
   `accounts ON` instead of `accounts OFF`.
2. Fix the things in **[GOING-LIVE.md](GOING-LIVE.md)** first — real SMTP above
   all, because magic link is the only way into the app and Supabase's built-in
   sender will throttle you into a lockout.
3. To carry this journal across: sign in on the deployed site, then
   **Settings → Upload this device's data**. Or export a file here and restore
   it there. Both work.

Until then, none of that has to be true, and none of it costs anything.
