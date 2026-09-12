# Odyssey Journal

A trading journal that runs as one static page. No build step, no framework,
no server of its own.

---

## Open and test it

**Quickest:** download `index.html` and double-click it. It runs, and it saves —
data goes into that browser's IndexedDB. Everything works offline except the
charts, which come from a CDN.

**Closer to production**, and what you want before deploying:

```bash
cd journal
npx http-server -p 8080 .     # or: python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Use a local server rather than `file://` when you are testing **sign-in**:
Supabase magic links redirect to an origin, and `file://` has none.

### What to check

| Area | What to look at |
|---|---|
| Dashboard | Analytics leads the page; the mistake dashboard and edge score read from real trades |
| Journal | Table and gallery views, missed trades, improvement workshop |
| Review | Open a week, then **Export PDF** |
| Storage | The pill in the top right says where your data is being kept |

The journal ships with 37 imported trades so every dashboard has something to
show. **Settings → Reset** clears them.

---

## How storage works

One interface, three backends, picked automatically at boot:

1. **Claude artifact** — when the page runs inside Claude, it uses that runtime.
2. **Supabase** — when `config.js` is filled in *and* someone is signed in.
   Syncs across devices.
3. **IndexedDB** — everything else. Per-browser, per-device.

The pill in the top right always names the one in use, so "is this saved, and
where" is never a guess.

`localStorage` is deliberately unused: screenshots are held as data URIs and
would exhaust its ~5MB quota within a few trades.

---

## Deploy to Netlify

`netlify.toml` at the repository root is already set up: base `journal`,
publish `.`, and a build command that writes `config.js` from environment
variables.

1. Connect the repository in Netlify. It will read `netlify.toml`; nothing to
   configure by hand.
2. Add two environment variables under **Site configuration → Environment
   variables**:

   ```
   SUPABASE_URL       https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY  <the anon / public key>
   ```

3. Deploy.

Leave those variables unset and the site still works — it just has no accounts,
and each visitor's journal lives in their own browser.

The config also sets a content security policy, `nosniff`, a referrer policy,
and no-cache on `index.html` so a deploy never leaves someone on the old build.

---

## Set up Supabase

1. Create a project.
2. Open the **SQL editor** and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates one table and its row level security policies.
3. Under **Authentication → URL configuration**, add your Netlify domain (and
   `http://localhost:8080` for local testing) to the redirect allow list.
4. Put the project URL and **anon** key into Netlify's environment variables.

The anon key belongs in client code — that is what it is for. Every row is
protected by row level security, so a signed-in user can only reach their own.
**Never** put the `service_role` key in `config.js` or in the repository; it
bypasses those policies entirely.

### Moving existing data into an account

Sign in, then use **Upload this device's data** in the account pill. It copies
what is in that browser up to your account. It is a button rather than an
automatic merge so that signing in can never silently overwrite either side.

---

## Known limits

- **Screenshots are stored inline.** Images live as data URIs in the same
  key/value rows as everything else. That is fine for one trader, but for a
  product they belong in Supabase Storage with the row holding only a path.
  Worth changing before you have paying users with large image libraries.
- **No conflict resolution.** Last write wins. Editing the same journal in two
  tabs at once can lose an edit.
- **Charts need the CDN.** If cdnjs is unreachable the charts are blank and
  everything else still works.
