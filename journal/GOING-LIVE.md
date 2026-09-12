# What the journal still needs

Written after building it, in the order that matters. Everything in **Blockers**
has to be dealt with or you will lose data or lose customers. Everything below
that is a judgement call.

---

## 1. Blockers — do these before you log a real trade

### Sign in, or your journal lives in one browser

Without Supabase configured and signed in, your trades sit in one browser's
IndexedDB. Clearing site data, using a different browser, or opening it on your
phone all start from empty. Settings now states which case you are in.

- [ ] Run `supabase/schema.sql` in the SQL editor. It is safe to re-run, and it
      now creates **two** things: the `journal_kv` table and the `screenshots`
      storage bucket, each with its policies.
- [ ] Add your domains to **Authentication → URL configuration** in Supabase:
      your Netlify domain, plus `http://localhost:8080` for local testing.
      Sign-in links fail silently against an origin that is not listed.
- [ ] Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Netlify's environment
      variables and redeploy.

### Pick one origin and stay on it

Browser storage is per-origin. A local file, a Netlify deploy preview
(`deploy-preview-12--site.netlify.app`) and your live domain are **three
separate journals**. This is the thing most likely to look like data loss and
not be.

- [ ] Decide where your own journal lives — the live domain is the right answer —
      and only log real trades there.
- [ ] Once signed in this stops mattering, because the data is in Postgres
      rather than the browser.

### Email delivery will throttle you

Supabase's built-in email sender is rate limited to a handful of messages per
hour and is not meant for production. Your third customer signing up in the
same hour will not get their link.

- [ ] Add an SMTP provider under **Authentication → Emails → SMTP settings**
      (Resend, Postmark and SendGrid all work) before you let anyone else in.

### Back up before every deploy

- [ ] **Settings → Back up everything** writes one file containing your journal
      and your screenshots. **Restore from a backup** reads it back.
      Do this before each deploy until you trust the flow.
- [ ] Anything that replaces the journal takes a snapshot first, which
      **Settings → Roll back** restores. That covers mis-clicks, not a bad
      migration.

---

## 2. Known wrong — small, real, worth fixing

- [ ] **Orphaned screenshots need a manual sweep.** Deletion cascades now, but
      images orphaned by earlier versions only go when you run
      Settings → Find orphaned screenshots.

Cleared since this was written:

- ~~Your personal trading rules ship to every customer.~~ The pre-trade list is
  empty by default and collected during first-run setup, so nobody inherits
  somebody else's plan. The morning and evening routines stay seeded, being
  universal hygiene, and both are editable.
- ~~Missed-trade reasons are a fixed list.~~ Editable, with a starter set.
- ~~Mistake names are a fixed list.~~ Add, rename and remove, alongside each
  one's severity. Renaming rewrites the tag on every trade that used it, so
  history is not orphaned.

## 3. Not built — decide before launch

- [ ] **Nothing gates access.** Anyone who signs in gets a full journal. This is
      the one genuinely missing piece of a paid product. The usual shape is
      Stripe Checkout, a `plan` column on a profiles table, and a check at
      boot — but whether you sell a trial, a one-off licence or a subscription
      changes the design, so it needs your decision first.
- [ ] **No password sign-in.** Magic link only. Fine for most people, a
      complaint from some.
- [ ] **No error reporting.** When it breaks for a customer you will not know.
      Sentry's free tier covers this in about ten lines.
- [ ] **No terms, privacy policy or data export for customers.** You are
      storing traders' financial records; in the UK and EU they have a right to
      export and deletion. The export already exists — it needs to be reachable
      and documented.

---

## 4. Accepted limits

These are fine, but know them.

- **Last write wins.** Two tabs open on the same journal can lose an edit.
- **Charts come from a CDN.** If cdnjs is unreachable the charts are blank and
  everything else still works.
- **PDF export goes through the browser's print dialog.** That is deliberate —
  it produces real vector A4 rather than a screenshot — but it means the
  customer picks "Save as PDF" themselves.
- **Screenshots are capped at 1920px JPEG.** About 60KB each, so roughly 16,000
  fit in Supabase's free storage tier.
- **The calendar is tight on a phone.** Readable, but the month view is dense
  below about 400px.

---

## 5. Before you hand it to the first customer

- [ ] Sign up as a stranger would: new email, new browser, no data. Walk the
      first-run setup, log a trade, paste a screenshot, close the browser,
      come back.
- [ ] Check the journal is empty for that account and that you cannot see your
      own trades from it. That is the row-level-security policies doing their
      job, and it is worth confirming rather than assuming.
- [ ] Export a backup from that account and restore it into a third account.
- [ ] Delete a trade and confirm its screenshot count drops in
      Settings → Screenshots.
