# Turning on the subscription

One plan, everything in it. About 20 minutes.

Do this **after** [DEPLOY.md](DEPLOY.md) — it assumes Supabase and Netlify are
already working.

---

## How the gate actually works

Worth understanding before you set it up, because it is the part people get
wrong.

The browser check is only there to show the right screen. **Access is decided by
the database.** Row level security policies require an active subscription
before any write is accepted, so editing a variable in devtools changes what
someone sees and nothing they can do.

The rule is deliberately asymmetric:

| | Active subscriber | Lapsed |
|---|---|---|
| Read the journal | yes | yes |
| Export a backup | yes | yes |
| Write, edit, upload | yes | **no** |
| Delete their own data | yes | yes |

A trader whose card fails keeps their record and can take it with them. Locking
someone out of their own trading history to force a payment is both wrong and,
where they have a legal right to their data, a problem.

---

## 1. Stripe

1. <https://dashboard.stripe.com> → keep **Test mode** on for now.
2. **Product catalogue → Add product.**
   - Name it, set a recurring price, pick monthly or yearly.
   - Save, then copy the **price ID**. It starts `price_`, not `prod_`.
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…`).

### The webhook

This is what grants access. Without it, people pay and nothing happens.

1. **Developers → Webhooks → Add endpoint.**
2. Endpoint URL:

   ```
   https://your-site.netlify.app/.netlify/functions/stripe-webhook
   ```

3. Select these four events and no others:

   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   ```

4. Add the endpoint, then copy its **Signing secret** (`whsec_…`).

---

## 2. Supabase

1. Re-run [`supabase/schema.sql`](supabase/schema.sql). Safe to re-run; it adds
   the profiles table, the subscription check, and re-declares the journal
   policies with writing gated.
2. **Project Settings → API** → copy the **`service_role`** key.

> The service role key ignores every security policy in your database. It goes
> in Netlify's environment variables and nowhere else. Never in `config.js`,
> never in the repository, never in anything the browser downloads.

---

## 3. Netlify

**Site configuration → Environment variables.** You already have two; add five:

| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_PRICE_ID` | `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `STRIPE_TRIAL_DAYS` | optional, e.g. `7`. Omit for no trial |

Redeploy. The functions install their own dependency from `package.json` on
first build, so that deploy takes a little longer than usual.

---

## 4. Test it before anyone real pays

Use a second email, not your own account.

1. Sign up. You should land on the paywall.
2. Click **Subscribe**, pay with Stripe's test card `4242 4242 4242 4242`, any
   future expiry, any CVC.
3. You should come back to a working journal. If it hangs on the paywall for a
   few seconds that is the app waiting for the webhook, which is expected.
4. **Stripe → Developers → Webhooks → your endpoint** should show a `200`. If
   it shows `400`, your signing secret is wrong.
5. **Supabase → Table editor → profiles** should show `active` for that user.
6. Log a trade to confirm writing works.

### Then test lapsing, which is the case that actually goes wrong

1. **Stripe → Customers → your test customer → cancel the subscription
   immediately.**
2. Reload the journal. You should see the read-only banner and the lapsed
   paywall.
3. Confirm you can still read every trade and that **Export everything** works.
4. Try to edit something. It should refuse and say so, rather than appearing to
   save.

That last check matters most. A journal that looks like it saved and did not is
worse than one that plainly refuses.

---

## 5. Going live

1. Stripe → switch off **Test mode**. Create the product and price again; live
   mode has its own.
2. Create the webhook again in live mode; it has its own signing secret.
3. Replace the three `STRIPE_*` variables in Netlify with the live values.
4. Turn signups back on in Supabase (**Authentication → Sign In / Providers**).
5. Add real SMTP, per `GOING-LIVE.md`, or signup emails will throttle.

---

## Troubleshooting

**Paid, but still sees the paywall.** Check the webhook's delivery log in
Stripe. A `400` means the signing secret does not match. A `500` means the
service role key is wrong or missing. Fix and use **Resend** on that event.

**"Could not start checkout".** Usually `STRIPE_PRICE_ID` is a product id
(`prod_`) rather than a price id (`price_`).

**Everything is read-only for you too.** Expected — you are a user like any
other. Either subscribe with a test card, or set your own row's
`subscription_status` to `active` in the Supabase table editor.

**Nothing saves and there is no banner.** That means the browser thinks the
subscription is fine and the database disagrees. Check the profiles row matches
what Stripe shows.
