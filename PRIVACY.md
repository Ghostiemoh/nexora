# Nexora data flow

What actually happens to your data, traced from the code rather than from the
marketing copy. Every claim below names the file that backs it, so this document
can be re-checked instead of trusted.

The short version: files are parsed in the browser and never uploaded. Three
features do send data out, all opt-in, and none of them run in the background.
Any UI copy that says otherwise is a bug, and `src/lib/privacy-claims.test.ts`
fails the build when one appears.

---

## 1. Files you open (CSV, Excel, JSON, PDF, images)

**Nothing is transmitted.**

Parsing, profiling, cleaning, pivoting, SQL, and charting all run in the tab:

| Step | Where it runs |
|---|---|
| Parse | `src/lib/universal-parser.ts`, `src/lib/csv.ts` (papaparse, xlsx) |
| Profile and diagnose | `src/lib/profile.ts` |
| Clean and transform | `src/lib/clean.ts`, `src/lib/recipe.ts` |
| Pivot | `src/lib/pivot.ts` |
| SQL | `src/lib/sql-engine.ts` (in-browser engine, no server) |
| Findings and narrative | `src/lib/insights.ts`, `src/lib/auto-dashboard.ts` |
| OCR | pdf.js + Tesseract, both in-tab (`src/app/(app)/ocr-center/page.tsx`) |

Storage is `localStorage`, unencrypted, via the zustand `persist` middleware
(`src/lib/store.ts`). Large datasets stay in memory only, because the store has
a quota guard that drops writes over the limit.

The OCR page loads Tesseract and pdf.js from jsdelivr at runtime. The CDN sees
that you fetched a library. It never sees your file.

---

## 2. Database connections

**This is the path that carries the most, and it is the one people most often
assume is local. It is not.**

```
Browser                    Nexora API (Node)              Your database
  |                              |                              |
  |-- POST /api/db/test -------->|                              |
  |   { connectionString, type } |-- TCP connect (pg/mysql2) --->|
  |                              |<-- table list ---------------|
  |<-- { tables: [...] } --------|                              |
  |                              |                              |
  |-- POST /api/db/query ------->|                              |
  |   { connectionString, query }|-- SELECT ------------------->|
  |                              |<-- result rows --------------|
  |<-- { columns, rows } --------|  (up to 50,000, in memory)   |
```

Routes: `src/app/api/db/test/route.ts`, `src/app/api/db/query/route.ts`.

### What leaves the browser

The **entire connection string, including the password**, plus the SQL text. On
every test and every import.

### What reaches Nexora's server

The same, plus **every row of the result set**, which materializes in server
memory (capped at 50,000 rows) before being serialized back to the browser.

### What is stored

Nothing, by this code. Neither route writes to a disk or a database, and neither
logs the request body. But two caveats are honest to state:

- The app does not control its **hosting provider's** request logging. On a
  serverless platform, request and response bodies can appear in platform logs.
- Errors are returned verbatim from `pg` / `mysql2`
  (`route.ts:75`, `route.ts:52`). Driver errors can quote fragments of the
  failing statement.

### Where credentials live

In `localStorage`, **unencrypted**, under the `connections` key
(`store.ts` `partialize`). Anyone with access to the browser profile, or any XSS
on the origin, can read them. Use a read-only database user.

### Read-only enforcement

`src/lib/db-guard.ts` strips comments, rejects multiple statements, requires the
statement to start with `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN`, and
rejects any write or DDL keyword. This is a real guard, not decoration, and it
correctly blocks the data-modifying-CTE trick (`WITH x AS (INSERT ...)`).

### Known gaps on this path

These are not currently mitigated and should be treated as open:

1. **No authentication or rate limiting on either route.** A public deployment
   is an open proxy that will dial any host on request.
2. **Server-side request forgery.** The connection string is user-supplied and
   the *server* dials it. Pointing it at `169.254.169.254`, `127.0.0.1`, or an
   internal VPC address makes Nexora's own infrastructure reachable, and the
   returned error text distinguishes "refused" from "timed out", which is enough
   to port-scan the private network.
3. **No egress allow-list** on host, port, or scheme.

---

## 3. The AI analyst

**Goes straight from the browser to Google. No Nexora server is involved.**

```
Browser --(HTTPS, x-goog-api-key header)--> generativelanguage.googleapis.com
```

- Provider: Google Gemini. Model: `gemini-2.5-flash`, hardcoded in
  `src/lib/ai.ts`.
- Key: the user's own, entered in Settings, stored unencrypted in
  `localStorage` under `settings.geminiApiKey`.
- The key travels in the `x-goog-api-key` **header**, not the query string, so
  it does not land in browser history, `Referer` headers, or proxy access logs.
- There is **no fallback provider and no second model**. Without a key, the
  AI-specific features are hidden and the deterministic engine in
  `src/lib/insights.ts` continues to work, sending nothing.

### What is in every request

From `buildSchemaContext` (`src/lib/ai.ts`):

- Table name and row count.
- Every column's name, type, and stats: min, max, mean, median, date range,
  missing count.
- The **four most frequent values** in each column.
- The **first five rows of the dataset, verbatim, as JSON**.

Those last two are real values out of the file. "Only the schema is sent" would
be false, and the UI no longer says it.

### Retention

Governed by the user's own Google API terms, not by Nexora. Free Gemini API
tiers in particular may retain prompts for product improvement. Nexora cannot
see, log, or delete these requests, because they never pass through it.

---

## 4. Sync (optional)

Off unless `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
set **and** the user signs in.

- Encrypted on the device with AES-256-GCM before upload (`src/lib/crypto.ts`).
  The server receives ciphertext, an HMAC row identifier, and a timestamp.
- The password is derived twice under different context strings. One result is
  what Supabase checks; the other never leaves the device and wraps the data
  key.
- Row Level Security keyed to `auth.uid()` on every table
  (`supabase/migrations/0001_sync.sql`), verified by `src/lib/migration.test.ts`.
- What sync never carries: connection strings, the Gemini key, export history,
  AI chat transcripts, the audit log. Enforced by `src/lib/sync-payload.test.ts`.

---

## 5. The four user states

| State | Files | Database | AI | Sync |
|---|---|---|---|---|
| Local, no account | In-browser only | Not used | Off without a key | Off |
| Local + AI key | In-browser only | Not used | Stats and 5 rows to Google | Off |
| Local + database | In-browser only | Creds and rows via Nexora API | As above | Off |
| Signed in | In-browser only | As above | As above | Ciphertext to Supabase |

Signing in changes **only** the sync column. It has no effect on the database or
AI paths, which is why "nothing leaves until you sign in" was the wrong sentence
in six places.

---

## Copy rules

Do not write, anywhere in the product:

- "Your data never leaves this device."
- "Your data is completely private."
- "Nothing is sent to our servers."

They are false on at least one of the three paths above. `privacy-claims.test.ts`
enforces this. If a phrase there becomes true, delete it from the list in the
same commit that makes it true.
