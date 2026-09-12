# Getting it online and using it yourself

Follow this in order. It ends with you journalling real trades on your own
private site, with nobody else able to sign up.

Roughly 30 minutes, most of it waiting for Supabase.

---

## Part 1 — Supabase (your database)

### 1.1 Create the project

1. Go to <https://supabase.com> and sign in.
2. **New project**. Name it anything. Pick the region closest to you.
3. Set a database password and save it somewhere. You will not need it for this,
   but you will later.
4. Wait for it to finish provisioning. Two or three minutes.

### 1.2 Create the tables

1. In the left sidebar, **SQL Editor** → **New query**.
2. Open `journal/supabase/schema.sql` from the repository, copy all of it, paste
   it in.
3. **Run**.

You should see `Success. No rows returned`. That created one table and one
storage bucket, each locked to its owner. Re-running it later is safe.

### 1.3 Close the door behind you

By default anyone who finds your URL can create an account. While it is only
you, turn that off.

1. **Authentication** → **Sign In / Providers**.
2. Find **Allow new users to sign up** and turn it **off**.
3. **Authentication** → **Users** → **Add user** → **Create new user**.
   - Enter your own email.
   - Tick **Auto Confirm User** so you do not need a confirmation email.
   - Create it.

Now only your account exists, and nobody can add another. When you are ready
for customers, turn signups back on.

### 1.4 Copy your two keys

1. **Project Settings** (the cog) → **API**.
2. Copy **Project URL** — looks like `https://abcdefgh.supabase.co`.
3. Copy the **anon / public** key — a long string starting `eyJ`.

Keep these two. **Never copy the `service_role` key** — it ignores all the
security rules you just created.

---

## Part 2 — Netlify (your site)

### 2.1 Connect the repository

1. Go to <https://app.netlify.com> → **Add new site** → **Import an existing
   project** → **GitHub**.
2. Authorise Netlify if it asks, then pick `task-manager-docker`.

### 2.2 Point it at the right branch

**This is the step people miss.** The journal lives on the branch
`claude/trading-journal-ui-xta92v`, not on `main`. If you leave the default,
Netlify builds `main`, finds no journal, and deploys nothing.

On the setup screen, set **Branch to deploy** to:

```
claude/trading-journal-ui-xta92v
```

Leave the build command and publish directory alone — `netlify.toml` in the
repository already sets them. If Netlify pre-filled them, clear the fields.

Don't deploy yet.

### 2.3 Add your keys

Still on the setup screen, open **Add environment variables** (or afterwards,
**Site configuration → Environment variables**) and add two:

| Key | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from 1.4 |
| `SUPABASE_ANON_KEY` | the anon key from 1.4 |

### 2.4 Deploy

Hit **Deploy**. It takes under a minute.

Check the deploy log. You are looking for:

```
[build] dist/ ready — index.html 429KB, config.js written
[build] accounts ON — signing in syncs to Supabase
```

If it says **accounts OFF**, your environment variables did not take. Fix them
and redeploy — otherwise your journal saves to one browser only.

### 2.5 Name it

**Site configuration → Change site name.** Pick something obscure while it is
only you, for example `odyssey-private-7f3a`. Your URL becomes
`https://odyssey-private-7f3a.netlify.app`.

---

## Part 3 — Tell Supabase about your site

Sign-in links fail silently against an origin Supabase does not know.

1. Back in Supabase: **Authentication** → **URL Configuration**.
2. **Site URL**: your Netlify URL from 2.5.
3. **Redirect URLs**: add both, one per line:

```
https://your-site.netlify.app
https://your-site.netlify.app/
```

4. Save.

---

## Part 4 — First run

1. Open your Netlify URL.
2. You should see **Welcome Back**, then an empty journal and the setup
   walk-through.
3. Top right, the pill says **Saved on this device only**. Click **Sign in to
   sync**.
4. Enter the email you created in 1.3. Check your inbox and open the link **on
   the same device**.
5. The page reloads. The pill should now read **Synced · your@email**.

**If the pill still says "this device only"**, sign-in did not take. Check
Part 3, and check the browser console for a Supabase error.

### Confirm it really persists

Do this once. It takes a minute and it is the difference between trusting the
thing and hoping.

1. Log one trade. Paste a screenshot into it.
2. Open the same URL in a **different browser** (not a second tab) and sign in
   with the same email.
3. Your trade and screenshot should be there.

If they are, your data is in Postgres, not in a browser, and you can stop
worrying about it.

---

## Part 5 — Using it while you keep changing it

### Your data survives deploys

Code and data are completely separate. Deploying a new `index.html` does not
touch your trades — they are rows in Supabase. Deploy as often as you like.

### Back up anyway, before each deploy

**Settings → Back up everything** writes one file with your journal and your
screenshots in it. **Restore from a backup** reads it back. Keep the last few.

The one thing a backup protects against that Supabase does not: a change to how
the journal reads its own data. That is the only way a deploy could hurt you,
and a backup makes it recoverable.

### If something looks wrong after a deploy

1. Check **Settings → Where your data lives**. If it says "this device only",
   you are signed out — sign in again, nothing is lost.
2. If a number looks wrong, hard-refresh (Ctrl/Cmd + Shift + R) to make sure
   you are not on a cached page.
3. If data really is missing, **Settings → Roll back** restores the automatic
   snapshot, or restore your last backup file.

### The trap: one journal per origin

Browser storage is per-origin, and Netlify gives every branch and pull request
its own URL. `deploy-preview-3--yoursite.netlify.app` is a **different journal**
from `yoursite.netlify.app`.

Once you are signed in this stops mattering, because your data comes from
Supabase rather than the browser. Until then, only log real trades on your one
real URL.

---

## Part 6 — When you are ready for customers

1. Turn signups back on: **Authentication → Sign In / Providers → Allow new
   users to sign up**.
2. Add a real email provider: **Authentication → Emails → SMTP settings**.
   Supabase's built-in sender is limited to a handful of messages per hour, so
   your third signup in an hour gets nothing.
3. Merge the branch into `main` and switch Netlify's deploy branch to `main`,
   so your production site is not tracking a working branch.
4. Work through `GOING-LIVE.md`. The important one: **nothing currently gates
   access**, so anyone who signs up gets a full journal.

---

## Quick reference

| Thing | Where |
|---|---|
| Site | `https://<your-site>.netlify.app` |
| Deploy branch | `claude/trading-journal-ui-xta92v` |
| Build command | `node scripts/build-config.js` (set in `netlify.toml`) |
| Published folder | `journal/dist` |
| Env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Schema to run | `journal/supabase/schema.sql` |
| Backup | Settings → Back up everything |
