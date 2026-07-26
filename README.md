# Nexora

Nexora cleans, profiles, and charts spreadsheet data inside the browser. Drop in a CSV, an Excel file, or a JSON export, and it tells you what is wrong with the data, fixes the problems you approve, builds a dashboard, and writes a report you can hand to a client. Nothing gets uploaded anywhere.

## Why it exists

Real exports arrive broken in predictable ways. An unnamed index column. Dates stored as Excel serial numbers like `44391`. Text mangled into `1775â€“1783` because a UTF-8 file was saved as Latin-1. `john adams` in one row and `JAMES MONROE` in the next. `Republicans` where every other row says `Republican`. Two rows that look identical until you spot the typo in one of them.

Fixing that by hand takes about forty minutes, and next month the same export shows up and you do it again. Nexora fixes it in a click and saves the steps to a file you can replay.

## What it does

### Dataset Doctor

Scores the data on completeness, accuracy, validity, and consistency, then lists what it found. Each proposed fix tells you how many cells it will change before you run it, so nothing happens behind your back.

The one-click fixes cover duplicate and blank rows, stray whitespace, broken encoding, Excel serial dates, inconsistent casing, typo and plural variants of the same category, leftover index columns, and missing values filled by median or mode. Find and replace and text to columns are in there too, since those are what people miss most from Excel.

### Cleaning recipes

Every fix you apply gets recorded. Export the sequence as a recipe file and you can replay the entire cleanup on next month's copy of the same messy export in one click. Undo works on any step.

### Auto dashboard

The dashboard builds itself out of whatever the data supports: KPI cards, donut charts for categories, histograms for numbers, pivot bars, and a time series when there is a usable date column. Click any slice or bar and every other card refilters around it.

Next to the charts, Nexora writes out what it noticed in ordinary sentences. Which category carries most of the revenue. Whether a column is skewed badly enough that you should quote the median instead of the mean. How the most recent period compares with the one before it.

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

`src/lib/` holds the logic and imports no React: profiling, cleaning, the SQL engine, dashboard generation, recipes, and the read-only SQL guard. The unit suite covers all of it, so the statistics can be checked instead of taken on faith.

The store re-profiles a dataset after every cleaning operation, which is what lets fixes cascade. Merging a typo can turn two near-identical rows into exact duplicates, and then the duplicate check catches them on the following pass.

Datasets persist to localStorage behind a quota guard. Anything too large to store stays in memory for the session.
