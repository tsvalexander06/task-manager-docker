# Launch runbook

In order. Steps 1–4 put it on your own domain and take money. Step 5 is what
stands between "it works" and "I can sell this to a stranger" — most of it is
paperwork, and Stripe will not approve a live account without some of it.

Mechanics live in the other three docs; this is the order and the judgement.

| | |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Supabase and Netlify, in detail |
| [BILLING.md](BILLING.md) | Stripe, in detail |
| [REDEPLOY.md](REDEPLOY.md) | Shipping changes without losing data |

---

## 1. Buy the domain

Buy it wherever you like — Namecheap, Cloudflare, Porkbun. One thing matters:
**buy it somewhere you can edit DNS records**, which is everywhere reputable.

A short `.com` is worth the money for something people type and recommend. Avoid
hyphens and numbers; avoid `.io` if you want a UK or EU audience to trust it on
sight.

Expect £8–£15 a year. Turn on WHOIS privacy — it is usually free and keeps your
home address out of a public database.

---

## 2. Point it at Netlify

Netlify can host the DNS or just answer for it. **Let Netlify host it** unless
you already run mail on that domain.

1. Netlify → your site → **Domain management → Add a domain**.
2. Type the domain. Netlify says it is registered elsewhere and offers to
   verify.
3. It gives you four nameservers, like `dns1.p03.nsone.net`.
4. At your registrar, replace the existing nameservers with those four.
5. Wait. Usually 15 minutes, occasionally 24 hours. Netlify's panel goes green
   on its own.

Then, in the same panel:

- Set the domain **without** `www` as primary (or with — pick one, be
  consistent). Netlify redirects the other automatically.
- **HTTPS → Verify DNS configuration**, then **Provision certificate**.
  Free, automatic, renews itself. Do not skip it: Stripe will not take
  payments on a page served over plain HTTP.

**Then update the two places that hard-code the old URL**, or sign-in breaks:

- Supabase → **Authentication → URL configuration** → add
  `https://yourdomain.com` as Site URL and to the redirect allow-list. Leave the
  `netlify.app` one there too until you are sure.
- Stripe → the webhook endpoint's URL (step 4 below).

---

## 3. Publish

Netlify is already building from the branch. Nothing to do but confirm what it
built:

1. **Deploys → the newest one → Deploy log.** Look for:

   ```
   [build] accounts ON — signing in syncs to Supabase
   ```

   **accounts OFF** means `SUPABASE_URL` / `SUPABASE_ANON_KEY` are missing.
   Fix and redeploy before anyone touches it, or every visitor's journal lives
   in their own browser and nothing syncs.
2. Open the domain in a private window. Sign up with an email you have not used.
3. Log a trade, paste a screenshot, close the browser, come back. It should all
   be there.

---

## 4. Take payments

Follow [BILLING.md](BILLING.md) end to end in **test mode** first — test cards,
cancel the subscription, confirm a lapsed account can still read and export but
cannot write. That asymmetry is the whole design: never lock someone out of
their own trading history to force a payment.

Then switch to live mode. Note what carries over and what does not:

| | Test → live |
|---|---|
| Product and price | **recreated** — live mode has its own, new `price_` id |
| Webhook endpoint | **recreated** — new signing secret |
| `STRIPE_SECRET_KEY` | replaced with the `sk_live_` key |
| Customers, subscriptions | not carried over, and that is correct |

Before Stripe will let you charge real cards it asks for:

- Your legal name and address, or your company's
- A bank account for payouts
- What you sell and roughly how much per month
- **A live website URL with your terms and a refund policy on it** — see below

Allow a day or two for review, so do not leave this to launch morning.

---

## 5. What still has to be true before a stranger pays you

The journal works. These are the things around it that do not exist yet, in the
order that will hurt.

### Terms and a privacy policy — a hard blocker

Stripe asks for both at a public URL as part of approval. You are also storing
other people's financial records, which in the UK and EU means they have a legal
right to export and deletion.

The export already exists. What is missing is two pages and a link to them.

- [ ] Write **Terms of service**: what the subscription includes, that it renews
      monthly, how to cancel, and that the journal is a record-keeping tool and
      not financial advice. Say the last one plainly — you are selling to
      traders.
- [ ] Write a **Privacy policy**: what you store (email, trades, screenshots),
      where (Supabase, in its region), who else sees it (nobody), how someone
      exports or deletes theirs.
- [ ] Add a **refund policy**. Even "no refunds on partial months, cancel any
      time" is enough; the absence of one is what causes disputes.
- [ ] Put all three somewhere reachable and link them from the paywall.

Generators are fine for a first version — Stripe wants them to exist and be
accurate, not to be beautiful. Have someone read them if you are in the EU.

### Email that actually sends — a hard blocker

Supabase's built-in sender is rate limited to a handful of messages an hour and
is explicitly not for production. **Your third signup in the same hour will not
get their link, and they will assume the product is broken.**

- [ ] Supabase → **Authentication → Emails → SMTP settings**. Resend, Postmark
      and SendGrid all work and all have a free tier at this size.
- [ ] Send yourself a test from a fresh address before you announce anything.

### You will not know when it breaks

- [ ] Add Sentry, or the equivalent. Free tier, about ten lines. Without it, a
      customer hits an error and you find out only if they bother to tell you.

### Support has to reach you

- [ ] A support email on the paywall and in the terms. `support@yourdomain.com`
      forwarded to your inbox is enough.

---

## 6. The dress rehearsal

Do this as a stranger, in a browser you have never signed in from.

- [ ] Sign up with a new email. Walk the first-run setup.
- [ ] Confirm the journal is **empty** — you must not see your own trades. That
      is row level security doing its job and it is worth confirming rather
      than assuming.
- [ ] Subscribe with a real card. Confirm the paywall lifts within seconds.
- [ ] Log a trade, paste a screenshot, sign out, sign back in on your phone.
- [ ] Cancel from the billing portal. Confirm you can still read and export but
      not write.
- [ ] Restore that account's journal from a file on a third account.

If all six pass, you can sell it.

---

## 7. Accepted limits

Fine, but know them.

- **Last write wins.** Two tabs on the same journal can lose an edit.
- **Charts come from a CDN.** If cdnjs is unreachable the charts are blank and
  everything else works.
- **PDF export goes through the browser's print dialog** — deliberate, because
  it produces real vector A4 rather than a screenshot.
- **Screenshots are capped at 1920px JPEG**, about 60KB each. Roughly 16,000 fit
  in Supabase's free storage tier.
- **Magic-link sign-in only.** No password. Fine for most, a complaint from
  some.
- **The calendar is dense below about 400px wide.** Readable, but tight.

---

## 8. Your data, while you work on it

The journal takes a restore point by itself within a minute of every change, and
immediately if you close the tab with an edit outstanding. Twelve are kept,
thinned so they cover this afternoon and last week. **Settings → Automatic
backup** lists them; each restores in a click.

Before a deploy that changes how records are read, see
[REDEPLOY.md](REDEPLOY.md). For everything else, deploys do not touch data —
code is on Netlify, trades are in Postgres.
