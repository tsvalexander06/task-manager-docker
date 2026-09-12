/* Odyssey Journal — deployment config.
 *
 * Leave blank to run the journal with no account: data is stored in the
 * browser's IndexedDB on that device only.
 *
 * Fill both values to turn on accounts and cross-device sync. The anon key is
 * meant to be public — it is safe in client code because every table is
 * protected by row level security (see supabase/schema.sql). Never put the
 * service_role key here.
 *
 * On Netlify this file is overwritten at build time from SUPABASE_URL and
 * SUPABASE_ANON_KEY by scripts/build-config.js.
 */
window.ODYSSEY_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Shown on the paywall, e.g. '$20 / month'. Label only — the amount actually
  // charged is whatever the Stripe price says.
  priceLabel: ''
};
