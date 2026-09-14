# Redeploying without losing your data

Short version: **your data is not in the site, so deploying cannot touch it.**
The code lives on Netlify, your trades live in Supabase. Replacing one does not
go near the other.

The rest of this is the careful version, plus the two cases where that isn't
quite the whole story.

---

## The 60-second version

1. **Check Settings → Automatic backup** shows a recent restore point. The
   journal takes one within a minute of every change, so there should be.
2. Push your change. Netlify rebuilds on its own.
3. Reload the site with **Ctrl/Cmd + Shift + R**.
4. Check Settings still says **Synced**.

Done. Your trades were never involved.

---

## Why deploys are safe

| | Where it lives | Touched by a deploy |
|---|---|---|
| The app itself | Netlify, rebuilt each deploy | replaced every time |
| Trades, accounts, reviews, playbook | Supabase Postgres | no |
| Screenshots | Supabase Storage | no |
| Signed-out journal | that browser's IndexedDB | no |

A deploy uploads a new `index.html` and a generated `config.js`. Neither file
contains any of your data.

There is also no version check that can wipe anything. The journal records
which data version last wrote it (`DATA_VERSION`), but it **never compares
that number and never clears on a mismatch**. Bumping it cannot erase a
journal.

---

## The two things that actually could bite

### 1. A release that changes how records are read

This is the only real risk, and it's why step 1 is the backup. If a change
alters the shape of a stored record and reads it back wrongly, the data is
still safe in Postgres, but the app could display it wrong — and then save the
wrong version over it.

Every release is tested against a journal written by the *previous* version
before it ships. The current build was checked with pre-upgrade records
carrying the old grade fields, the old entry types and the old risk grades:
trades, notes, mistakes, accounts, reviews, missed trades, symbols and setups
all came through intact, and previously graded trades kept their scores.

**Your protection is the backup.** Take one before each deploy until you've
done it a few times and trust the process.

### 2. Signing in on a different URL

Browser storage is per-origin, and Netlify gives every branch and preview its
own URL. `deploy-preview-4--yoursite.netlify.app` has a **completely separate**
journal from `yoursite.netlify.app`.

Once you're signed in this stops mattering, because the data comes from
Supabase rather than the browser. It only bites when you're testing signed out
and then wonder where everything went.

---

## Deploying a change, step by step

1. **Check the restore points.** Settings → Automatic backup. Twelve are kept,
   thinned so they cover this afternoon and last week.
2. **Push to the branch Netlify watches** (`claude/trading-journal-ui-xta92v`).
   Netlify starts the build automatically.
3. **Watch the deploy log.** You want to see:

   ```
   [build] dist/ ready — index.html <size>KB, config.js written
   [build] accounts ON — signing in syncs to Supabase
   ```

   **accounts OFF** means the Supabase environment variables didn't reach the
   build. Fix them (Site configuration → Environment variables) and redeploy
   *before* using the site — otherwise it saves to that browser alone and
   you'll have trades in two places.
4. **Hard-refresh** the live site: Ctrl/Cmd + Shift + R. `index.html` is served
   no-cache, but a hard refresh removes all doubt.
5. **Spot-check**: Settings says *Synced*, the trade count is right, and one
   trade opens with its screenshot showing.

---

## Trying a layout change

The dashboard ships in two layouts and you switch between them live — no
redeploy, nothing lost either way:

- **Settings → Dashboard layout**, or
- the line at the foot of the dashboard: *Focused layout · show everything*.

**Focused** cuts the panels that restate figures shown elsewhere and moves the
mistake dashboard to Patterns and the technicals tabs to Playbook.
**Everything** is the original, all of it on the dashboard.

The choice is stored per journal and survives reloads and deploys. It changes
only what is drawn — every figure is computed the same way in both.

## If a release also needs SQL

Occasionally a change needs a database update too. When it does, it'll say so.
Then:

1. Back up first.
2. Supabase → SQL Editor → run `supabase/schema.sql` again. It's written to be
   re-runnable: tables use `if not exists`, policies are dropped and recreated.
   It never drops a table and never deletes a row.
3. Redeploy the site.

---

## If something looks wrong afterwards

Work down this list. It's almost always the first item.

1. **Settings → Where your data lives.** If it says *this device only*, you're
   signed out. Sign in again — nothing is lost, it's just looking in the wrong
   place.
2. **Hard-refresh.** A cached older page reading newer data explains a
   surprising number of oddities.
3. **Check the data, not the screen.** Supabase → Table editor → `journal_kv`.
   Your trades are the row with key `falcon:trades`. If that row is there, your
   data is fine and the problem is display only.
4. **Settings → Automatic backup → Restore** rolls the journal back to any of
   the kept restore points.
5. **Settings → Restore from a file…** reads a journal file back in, if you
   have one from elsewhere.

---

## Rolling back the app

Netlify keeps every deploy it has ever built.

**Deploys → open the last good one → Publish deploy.**

It's instant, and it doesn't touch your data, so the journal comes back exactly
as it was on the older build. This is the fastest fix if a change breaks
something while you're mid-session.

---

## What never to do

- **Don't run `grant-access.sql` with a different email** hoping to move an
  account across. All it does is set a subscription status.
- **Don't delete and recreate the Supabase project.** That is the one action
  that genuinely destroys everything. Restoring a backup into a fresh project
  works — but only if you have the backup.
- **Don't paste the `service_role` key into `config.js`** or anywhere in the
  repo. It bypasses every security policy, and `config.js` is downloaded by
  every visitor's browser.
