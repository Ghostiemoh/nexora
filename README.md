# Nexora — Upload Data. Get Decisions.

Local-first data cleaning, profiling, and analytics that runs **entirely in your browser**. Drop a messy CSV, Excel, or JSON file and Nexora profiles it, diagnoses what's wrong, fixes it in one click, charts everything it can, and compiles a client-ready report — without a single byte leaving your machine.

## Why

Every analyst has lived this loop: an export lands with `__EMPTY` index columns, Excel serial dates (`44391`), broken encoding (`1775â€“1783`), `john adams` next to `JAMES MONROE`, `Republicans` next to `Republican`, and near-duplicate rows hiding behind a typo. Fixing that in Excel is 40 minutes of muscle memory. Nexora does it in one click — and remembers how.

## Features

- **Dataset Doctor** — health score across completeness, accuracy (IQR outliers), validity, and consistency; every diagnostic shows its blast radius ("will change 94 cells") before you apply it
- **One-click fixes** — dedup, blank rows, whitespace, encoding repair (mojibake), Excel serial date conversion, casing standardization, typo/plural merging (edit-distance), index-column removal, median/mode imputation
- **Cleaning recipes** — every fix is recorded; export as JSON and replay on next month's file in one click. Undo supported
- **Auto dashboard** — KPIs, pies, histograms, pivots, and time series generated from whatever structure the data supports; click any slice or bar to cross-filter the whole board
- **Auto insights** — plain-English findings: concentration (Pareto), period-over-period movement, correlation, skew, outliers
- **SQL Lab** — query your data with SELECT / WHERE / GROUP BY / ORDER BY, aggregates including `COUNT(DISTINCT)`, currency-aware numerics
- **Reports** — CSV, Excel (two-sheet XLSX with audit trail), Markdown, and printable PDF with the visual appendix
- **Data Sources** — connect PostgreSQL/MySQL through Nexora's own API routes (read-only enforced server-side) and import tables or custom queries
- **AI (bring your own Gemini key)** — natural-language chat about your data, English→SQL generation, and AI review of failed/slow queries; only the schema and a few sample rows are sent, never the dataset
- **Team workspace** — export the whole workspace (datasets + recipes + roster) as one bundle a teammate imports; no server, no accounts
- **Alerts, audit log & history** — notification bell for imports/health/connections/exports, an append-only audit log, and an export history where anything can be re-downloaded
- **OCR Center** — extract tables from screenshots and PDFs (text-layer first, OCR fallback), straight to dataset or Excel
- **Local-first** — parsing, profiling, cleaning, querying, and reporting happen client-side; the only network calls are the ones you opt into (your database, your AI key)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit suite
npm run lint
npm run build
```

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Zustand (persisted) · Recharts · PapaParse · SheetJS · Framer Motion · Vitest

## Architecture notes

- `src/lib/` is pure, tested logic (profiling, cleaning, SQL engine, dashboard spec generation, recipes) — no React imports
- `src/lib/profile.ts` re-profiles the dataset after every cleaning op, so fixes cascade (e.g. a typo merge can turn near-duplicate rows into exact duplicates, which dedup then catches)
- Datasets persist to localStorage behind a quota guard; large datasets stay in memory
