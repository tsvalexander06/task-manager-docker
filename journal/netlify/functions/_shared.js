/* Shared helpers for the Stripe functions.
 *
 * Everything here runs on Netlify, never in the browser, because it needs the
 * Stripe secret key and the Supabase service role key. Neither may ever appear
 * in client code — the service role key bypasses every row level security
 * policy in the database.
 */
const Stripe = require('stripe');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const stripe = () => new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });

/* Identify the caller from the Supabase access token they send. Trusting a
 * user id from the request body instead would let anyone check out, or open the
 * billing portal, as somebody else. */
async function userFromToken(authHeader) {
  const token = (authHeader || '').replace(/^Bearer /i, '');
  if (!token) return null;
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: requireEnv('SUPABASE_ANON_KEY') }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

/* Read or write a profile row with the service role key, which is the only way
 * to touch a table the browser is not allowed to write. */
async function profileRequest(path, init = {}) {
  const url = `${requireEnv('SUPABASE_URL')}/rest/v1/profiles${path}`;
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const getProfile   = id => profileRequest(`?id=eq.${id}&select=*`).then(r => (r && r[0]) || null);
const patchProfile = (id, patch) =>
  profileRequest(`?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

module.exports = { stripe, requireEnv, userFromToken, getProfile, patchProfile, profileRequest, json };
