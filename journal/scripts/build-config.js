#!/usr/bin/env node
/* Netlify build step.
 *
 * Assembles dist/ from the source directory and writes config.js from the
 * environment. Only the files that belong on the public web are copied — the
 * README, the going-live checklist and the SQL schema stay in the repository.
 *
 * Netlify build command:  node scripts/build-config.js
 * Environment variables:  SUPABASE_URL, SUPABASE_ANON_KEY
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Files that make up the deployed site. Anything not listed is not published.
// The legal pages are deliberately plain HTML outside the app: Stripe's reviewer,
// a lapsed customer and a regulator all have to reach them without signing in.
const SITE_FILES = ['index.html', 'terms.html', 'privacy.html', 'refunds.html', 'risk-disclaimer.html'];
const LEGAL_FILES = ['terms.html', 'privacy.html', 'refunds.html', 'risk-disclaimer.html'];

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
// What the paywall shows. The charge itself is whatever the Stripe price says;
// this is only the label, so the two are set together and cannot drift apart
// unnoticed.
const price = process.env.STRIPE_PRICE_DISPLAY || '';

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const f of SITE_FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error(`[build] missing required file: ${f}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(dist, f));
}

fs.writeFileSync(
  path.join(dist, 'config.js'),
  `window.ODYSSEY_CONFIG = {\n` +
  `  supabaseUrl: ${JSON.stringify(url)},\n` +
  `  supabaseAnonKey: ${JSON.stringify(key)},\n` +
  `  priceLabel: ${JSON.stringify(price)}\n};\n`
);

// Unfilled placeholders are the whole risk with scaffolded legal pages: they
// look finished at a glance and are not. Count them and say so, every build.
let todo = 0;
const todoBy = [];
for (const f of LEGAL_FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) continue;
  const n = (fs.readFileSync(src, 'utf8').match(/\[\[/g) || []).length;
  if (n) { todo += n; todoBy.push(`${f}: ${n}`); }
}

const size = (fs.statSync(path.join(dist, 'index.html')).size / 1024).toFixed(0);
console.log(`[build] dist/ ready — index.html ${size}KB, config.js written`);
if (todo) {
  console.log(`[build] LEGAL PAGES INCOMPLETE — ${todo} placeholder${todo === 1 ? '' : 's'} left (${todoBy.join(', ')})`);
  console.log('[build]   Stripe asks for terms, privacy and refunds at a public URL before');
  console.log('[build]   approving a live account. Fill every [[...]] before you apply.');
} else {
  console.log('[build] legal pages: no placeholders left');
}
console.log(url
  ? '[build] accounts ON — signing in syncs to Supabase'
  : '[build] accounts OFF — SUPABASE_URL / SUPABASE_ANON_KEY not set, ' +
    'each visitor keeps their journal in their own browser');
