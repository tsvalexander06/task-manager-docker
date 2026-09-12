#!/usr/bin/env node
/* Writes config.js from environment variables at build time, so the Supabase
 * values live in Netlify's settings rather than in the repository.
 *
 * Netlify build command:  node scripts/build-config.js
 * Environment variables:  SUPABASE_URL, SUPABASE_ANON_KEY
 */
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('[build-config] SUPABASE_URL / SUPABASE_ANON_KEY not set — ' +
               'building without accounts; the journal will save to each device only.');
}

const out = `window.ODYSSEY_CONFIG = {\n` +
            `  supabaseUrl: ${JSON.stringify(url)},\n` +
            `  supabaseAnonKey: ${JSON.stringify(key)}\n};\n`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), out);
console.log('[build-config] wrote config.js' + (url ? ' with Supabase enabled' : ' with accounts off'));
