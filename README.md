# Nexora

Nexora cleans, profiles, and charts spreadsheet data inside the browser. Drop in a CSV, an Excel file, or a JSON export, and it tells you what is wrong with the data, fixes the problems you approve, builds a dashboard, and writes a report you can hand to a client. Nothing gets uploaded anywhere.

## Why it exists

Real exports arrive broken in predictable ways. An unnamed index column. Dates stored as Excel serial numbers like `44391`. Text mangled into `1775â€“1783` because a UTF-8 file was saved as Latin-1. `john adams` in one row and `JAMES MONROE` in the next. `Republicans` where every other row says `Republican`. Two rows that look identical until you spot the typo in one of them.

Fixing that by hand takes about forty minutes, and next month the same export shows up and you do it again. Nexora fixes it in a click and saves the steps to a file you can replay.

The second month is the point. Nexora recognizes that the file you just dropped is another copy of one it has already cleaned, replays that exact cleanup, and then tells you what moved since last time. Same sequence in, same shape out, and a comparison at the end instead of a fresh set of judgement calls.

## How it is organised

The workspace follows the order real analysis happens in, and each step is its own page.

**Datasets** (`/launch`) is the front door. It lists everything loaded on this device with its type, when it arrived, when it last changed, and a preview of the first rows. Opening Nexora never reopens the last file on your behalf; you choose.

**Step 1 — Dataset Doctor** (`/dataset-doctor`) is quality only: health score, missing values, duplicates, outliers, type validation, and a fix for each.

**Step 2 — Dashboard** (`/dashboard`) is business intelligence only: KPIs derived from what your columns mean, charts chosen for their types, filters, and cross-filtering.

**Step 3 — Reports** (`/reports`) is the written analysis, editable and exportable.

Everything else — AI Analyst, SQL Lab, Pivot Table, OCR Center, Data Sources, Workflows, History — is a tool you reach for along the way.

## What it does

### Dataset Doctor

Scores the data on completeness, accuracy, validity, and consistency, then lists what it found. Each proposed fix tells you how many cells it will change before you run it, so nothing happens behind your back.

The one-click fixes cover duplicate and blank rows, stray whitespace, broken encoding, Excel serial dates, inconsistent casing, typo and plural variants of the same category, leftover index columns, and missing values filled by median or mode. Find and replace and text to columns are in there too, since those are what people miss most from Excel.

### Cleaning recipes

Every fix you apply gets recorded. Export the sequence as a recipe file and you can replay the entire cleanup on next month's copy of the same messy export in one click. Undo works on any step.

### The monthly close

A recipe is only worth recording if something knows when to replay it, so Nexora works that out for you. Drop in this month's export and it is matched against every dataset already on the device by normalized column names and inferred types. Headers drift between periods, so `Order Date`, `order_date`, and `ORDER-DATE` all read as one column, and a file that shares every header but agrees on none of the types is refused rather than matched. Columns the saved recipe deletes on its own are not counted against the match, since the stored copy is the cleaned file and the new one is still raw.

On a match, the workspace front door offers the close: replay the recorded steps, then read what changed. Schema drift comes first, because a column that arrived as text instead of numbers invalidates every total underneath it and you need to know that before you read anything else. Then row count, then the total and the mean of each numeric column, so a figure that moved because volume grew is distinguishable from one that moved because size did. Then the columns that arrived emptier than last period, then the category values that appeared and stopped appearing.

Nothing is applied without the click, undo still works afterwards, and a file that already carries applied steps shows the comparison rather than inviting a second pass over the same fixes.

### Dashboard

The dashboard reads what your columns *mean*, not just what type they hold, and builds the KPIs the data can actually support: total revenue, gross profit, profit margin, average order value, distinct customers, units, conversion rate, inventory value. A KPI the data cannot support is left out rather than shown as a zero, and row and column counts never appear as headline numbers because they are metadata, not business insight. Where there is a date column, every KPI is compared against the preceding window of equal length, so a half-finished month cannot read as a collapse.

Chart selection follows the same logic: a trend first, then what drives it, then how it splits, then how it is distributed. Every panel carries its own chart-type switcher — bar, line, pie, area, scatter, histogram, doughnut, heatmap — with the unsuitable ones disabled and the reason on the button. Filter the whole page from the filter bar, or click any bar or slice to cross-filter every other panel and KPI.

Next to the charts, Nexora writes out what it noticed in ordinary sentences. Which category carries most of the revenue. Whether a column is skewed badly enough that you should quote the median instead of the mean. How the most recent period compares with the one before it.

### Pivot Table

Two fields crossed, one measure aggregated by sum, average, min, max, or count, with totals both ways. Every total is recomputed from the source rows rather than from the cells above it, so an average of averages can never appear. Exports to CSV.

### SQL Lab

Runs real queries against the loaded data with SELECT, WHERE, GROUP BY, ORDER BY, and aggregates including `COUNT(DISTINCT)`. Values like `$1,200` count as numbers instead of getting silently skipped, which is the bug that quietly ruins most spreadsheet totals.

### Reports

CSV, Excel (one sheet of data plus one audit sheet), Markdown, or a printable PDF with the charts included.

### Data Sources

Connects PostgreSQL and MySQL through Nexora's own API routes and pulls tables or custom queries into the sandbox. The routes reject anything that is not a read.

### AI features

These need a free Google Gemini key, which you paste into Settings. With one, you can ask questions about your data in plain English, turn an English question into SQL, and get a failed or slow query explained and rewritten. Requests carry the column names, some summary statistics, and five sample rows. The dataset itself stays in the browser.

### Team workspace

Bundles the whole workspace, datasets and recipes and roster together, into a single file. A teammate imports it and has your exact setup. No accounts and no server involved.

### Cross-device sync

Opt-in, off until you sign in from Settings, and encrypted so that the server cannot read what it stores. Sign in with Google or with an email and password; either way you end up at the same encrypted vault.

What travels is the reusable half of a workspace: cleaning recipes, keyed by schema rather than by local dataset id, and the roster. So next month's export can land on a different machine and the monthly close still recognizes it, because the recipe arrived first. Datasets stay on the device that imported them.

The mechanics, because the claim is only worth as much as the design behind it:

- One random data key per account, wrapped once per credential. A password, a passphrase, and each recovery code each wrap the same key, which is why several credentials open one vault and why a password change re-wraps one small key instead of re-encrypting anything.
- Signing in with email and password derives that password twice under different context strings. One result is what the auth provider stores and checks; the other never leaves the device. Google sign-in has no user-held secret, so it supplies identity only and a passphrase supplies the key.
- Record ids are HMACs computed under a key derived from the data key, so they are stable across your devices and opaque to the server.
- Sealing happens in `sync-service.ts` before anything reaches the transport, so the only module that talks to a network handles ciphertext exclusively.
- The engine compares server-assigned revisions rather than two machines' clocks. Timestamps break a genuine conflict and nothing else.
- Trusting a device wraps the data key under a non-extractable key in IndexedDB, so the passphrase is asked once per device rather than once per visit.

Excluded on purpose, and enforced by a test that fails the build if the list is ever quietly extended: datasets, database connection strings, the Gemini API key, export history, chat transcripts, and the audit log.

Losing both your passphrase and your recovery codes means the synced records cannot be recovered. That is the price of the server not being able to read them.

To run sync on your own deployment, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` and apply `supabase/migrations`. Without them the feature reports itself unavailable rather than presenting a sign-in that cannot work.

### Alerts, audit log, and history

A notification bell covers imports, low health scores, and failed connections. The audit log only ever appends. The history page keeps every export so you can download any of them again later.

### OCR Center

Pulls tables out of screenshots and PDFs. For a PDF it reads the embedded text layer first, which is fast and exact, and only falls back to OCR on the pages that turn out to be scans. Results go straight to a dataset or an Excel file.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit suite
npm run lint
npm run build
```

## Stack

Next.js (App Router), React, TypeScript, Tailwind, Zustand, Recharts, PapaParse, SheetJS, Framer Motion, Vitest.

## How the code is arranged

`src/lib/` holds the logic and imports no React: profiling, cleaning, the SQL engine, column semantics, KPI derivation, dashboard composition, pivots, chart recommendation, recipes, and the read-only SQL guard. The unit suite covers all of it, so the statistics can be checked instead of taken on faith.

`fingerprint.ts` and `period-diff.ts` are the monthly close. The first decides whether two files are the same recurring export and reports exactly what drifted between them; the second measures the movement between two profiled datasets and writes it out in sentences. Both are pure, and `monthly-close.test.ts` exercises the whole loop as one pipeline: clean a file, drop in next month's copy, recognize it, replay, compare. That test fails if the loop breaks even while every individual module still passes.

The interesting pair is `semantics.ts` and `kpi.ts`. The first works out what a column means from its name and its distribution; the second turns that reading into KPI tiles, and refuses to emit one the data cannot support. `dashboard.ts` then composes panels as `ChartConfig` objects, which is the same shape the chart studio and the renderer already speak — that is what lets every panel on the dashboard be re-typed by the reader with no separate code path.

The store re-profiles a dataset after every cleaning operation, which is what lets fixes cascade. Merging a typo can turn two near-identical rows into exact duplicates, and then the duplicate check catches them on the following pass.

Datasets persist to localStorage behind a quota guard. Anything too large to store stays in memory for the session.
