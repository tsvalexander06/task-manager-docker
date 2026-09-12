/* Opens the Stripe billing portal, where a subscriber updates their card,
 * sees invoices, or cancels. Doing any of that ourselves would mean handling
 * card details, which is not worth it when Stripe hosts this for free. */
const { stripe, userFromToken, getProfile, json } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const user = await userFromToken(event.headers.authorization);
    if (!user) return json(401, { error: 'Not signed in' });

    const profile = await getProfile(user.id);
    if (!profile || !profile.stripe_customer_id) {
      return json(400, { error: 'No subscription to manage yet' });
    }

    const origin = event.headers.origin || `https://${event.headers.host}`;
    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: origin
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error('create-portal failed:', err);
    return json(500, { error: 'Could not open the billing portal' });
  }
};
