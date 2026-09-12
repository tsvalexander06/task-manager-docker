# Launch it for yourself

The shortest path to your own working journal. No Stripe, no customers, no
billing — you unlock your own account with one line of SQL and start logging
trades. Everything else comes later.

About 20 minutes, most of it waiting for Supabase.

---

## 1. Supabase — the database

1. <https://supabase.com> → sign in → **New project**.
2. Name it, pick the region closest to you, set a database password and save it
   somewhere.
3. Wait for it to provision. Two or three minutes.

### Create the tables

1. **SQL Editor** → **New query**.
2. Open `journal/supabase/schema.sql`, copy **all** of it, paste, **Run**.

Expect `Success. No rows returned`. Safe to re-run at any time.

### Keep everyone else out

You are the only user for now.

1. **Authentication → Sign In / Providers** → turn **Allow new users to sign
   up** **off**.
2. **Authentication → Users → Add user → Create new user.**
   - Your email.
   - Tick **Auto Confirm User**.
   - Create.

### Copy two values

**Project Settings → API**:

- **Project URL** — `https://abcdefgh.supabase.co`
- **anon / public** key — long string starting `eyJ`

Ignore the `service_role` key for now. You only need it when billing goes live.

---

## 2. Netlify — the site

1. <https://app.netlify.com> → **Add new site → Import an existing project →
   GitHub** → pick `task-manager-docker`.

2. **Set the deploy branch.** This is the step people miss — the journal is not
   on `main`, so the default builds nothing:

   ```
   claude/trading-journal-ui-xta92v
   ```

3. Leave build command and publish directory empty. `netlify.toml` sets them.

4. **Add environment variables** (on the setup screen, or afterwards under
   Site configuration → Environment variables):

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon key |
   | `STRIPE_PRICE_DISPLAY` | `$20 / month` |

   That last one is only the label on the paywall. Nothing charges anyone yet.

5. **Deploy.**

In the deploy log, look for:

```
[build] accounts ON — signing in syncs to Supabase
```

If it says **accounts OFF**, the two Supabase variables did not take. Fix them
and redeploy, or your journal will save to one browser only.

6. **Site configuration → Change site name.** Something obscure while it is just
   you, e.g. `odyssey-private-7f3a`.

---

## 3. Point Supabase at your site

Sign-in links fail silently against an origin Supabase does not know.

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: your Netlify URL.
3. **Redirect URLs**: add both lines:

   ```
   https://your-site.netlify.app
   https://your-site.netlify.app/
   ```

4. Save.

---

## 4. Sign in

1. Open your Netlify URL.
2. Top right: **Sign in to sync**. Enter your email.
3. Open the emailed link **on the same device**.
4. The page reloads and the pill reads **Synced · your@email**.

**You will now see the paywall.** That is correct — the gate applies to you like
anyone else. Next step fixes it.

---

## 5. Unlock your own account

1. Supabase → **SQL Editor → New query**.
2. Open `journal/supabase/grant-access.sql`, paste it, and change both copies of
   `you@example.com` to your email.
3. **Run.** The second statement should return one row reading `active`.

If it updates **0 rows**, you have not signed in yet. Do step 4 first.

4. Reload the journal. The paywall is gone.

---

## 6. Confirm it actually works

Five minutes, and it is the difference between trusting it and hoping.

1. Walk the first-run setup: your name, instruments, setups, confluences, rules.
2. Log a trade.
3. Open it and paste a TradingView screenshot with **Ctrl/Cmd + V**.
4. **Open the site in a different browser** — not a second tab — and sign in
   with the same email.
5. Your trade and screenshot should be there.

If they are, your data is in Postgres rather than in a browser, and you can stop
worrying about it.

---

## 7. Before you change anything

**Settings → Back up everything.** One file, journal and screenshots included.
**Restore from a backup** reads it back. Take one before each deploy until you
trust the flow.

Your data is not affected by deploys — code and data are completely separate —
but a backup covers the one case that could hurt: a change to how the journal
reads its own data.

---

## What is deliberately not done yet

- **No billing.** Nothing can charge anyone. `STRIPE_PRICE_DISPLAY` is just
  text on a screen nobody but you will see.
- **Signups are off.** Only accounts you create by hand in Supabase can get in.
- **Manage billing will error** if you click it in Settings. Expected — there is
  no Stripe configured behind it.

When you are ready to charge, `BILLING.md` picks up from here: create the $20
price in Stripe, add four more environment variables, and test with a card that
is not real.

---

## Quick reference

| | |
|---|---|
| Deploy branch | `claude/trading-journal-ui-xta92v` |
| Env vars now | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_PRICE_DISPLAY` |
| Schema | `journal/supabase/schema.sql` |
| Unlock yourself | `journal/supabase/grant-access.sql` |
| Backup | Settings → Back up everything |
