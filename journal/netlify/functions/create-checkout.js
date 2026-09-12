/* Starts a Stripe Checkout session for the single plan.
 *
 * The caller is identified from their Supabase token, never from anything in
 * the request body, so nobody can start a subscription against another
 * account. */
const { stripe, requireEnv, userFromToken, getProfile, patchProfile, json } = require('./_shared');

// Days of free trial on a new subscription. 0 means none.
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS || 0);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const user = await userFromToken(event.headers.authorization);
    if (!user) return json(401, { error: 'Not signed in' });

    const s = stripe();
    let profile = await getProfile(user.id);

    // One Stripe customer per account, reused on every later checkout, so the
    // billing portal and webhooks always resolve to the same person.
    let customerId = profile && profile.stripe_customer_id;
    if (!customerId) {
      const customer = await s.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      await patchProfile(user.id, { stripe_customer_id: customerId, email: user.email });
    }

    const origin = event.headers.origin || `https://${event.headers.host}`;
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: requireEnv('STRIPE_PRICE_ID'), quantity: 1 }],
      // The id travels on the subscription too, so a webhook that arrives
      // without the checkout session can still find the account.
      subscription_data: {
        metadata: { supabase_user_id: user.id },
        ...(TRIAL_DAYS > 0 ? { trial_period_days: TRIAL_DAYS } : {})
      },
      client_reference_id: user.id,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      allow_promotion_codes: true
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error('create-checkout failed:', err);
    return json(500, { error: 'Could not start checkout' });
  }
};
