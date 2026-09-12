/* The only thing that grants or revokes access.
 *
 * Access is never set from the browser. Stripe tells us what happened, we
 * verify the signature, and the profile row follows. That row is what the
 * database policies read, so this function is the whole subscription.
 *
 * Netlify base64-encodes the body when it is not plain text, and Stripe signs
 * the exact bytes it sent, so the raw string has to be reconstructed before
 * verifying. Parsing the JSON first and re-stringifying would break the
 * signature and every event would be rejected.
 */
const { stripe, requireEnv, patchProfile, profileRequest, json } = require('./_shared');

// Statuses that count as paid. Everything else loses write access.
const ACTIVE = ['active', 'trialing'];

async function profileIdForCustomer(customerId) {
  const rows = await profileRequest(`?stripe_customer_id=eq.${customerId}&select=id`);
  return rows && rows[0] ? rows[0].id : null;
}

async function applySubscription(sub) {
  // Prefer the id we attached at checkout; fall back to the customer lookup for
  // subscriptions created directly in the Stripe dashboard.
  let userId = sub.metadata && sub.metadata.supabase_user_id;
  if (!userId) userId = await profileIdForCustomer(sub.customer);
  if (!userId) {
    console.warn('No profile for Stripe customer', sub.customer);
    return;
  }
  await patchProfile(userId, {
    stripe_customer_id: sub.customer,
    subscription_status: sub.status,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString()
  });
  console.log(`Subscription ${sub.status} for ${userId}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  const signature = event.headers['stripe-signature'];

  let evt;
  try {
    evt = stripe().webhooks.constructEvent(
      raw, signature, requireEnv('STRIPE_WEBHOOK_SECRET')
    );
  } catch (err) {
    // An unverified event is either a misconfiguration or someone trying to
    // grant themselves a subscription. Either way it is refused.
    console.error('Webhook signature check failed:', err.message);
    return json(400, { error: 'Invalid signature' });
  }

  try {
    switch (evt.type) {
      case 'checkout.session.completed': {
        const session = evt.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription);
          if (!sub.metadata.supabase_user_id && session.client_reference_id) {
            sub.metadata.supabase_user_id = session.client_reference_id;
          }
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(evt.data.object);
        break;
      default:
        // Everything else is fine to ignore; Stripe sends a great deal.
        break;
    }
    return json(200, { received: true });
  } catch (err) {
    // A non-2xx makes Stripe retry, which is what we want for a transient
    // database failure.
    console.error(`Handling ${evt.type} failed:`, err);
    return json(500, { error: 'Handler failed' });
  }
};
