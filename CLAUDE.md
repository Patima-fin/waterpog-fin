# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
**Water POG Financial Console** — a Thai-language single-page financial dashboard (weekly cashflow, debt register, bank diary, IV/receivables, P&L, budget, etc.) for a construction/water company. Data lives in **Google Sheets**; the web app reads/writes it through a **Google Apps Script** web app. UI text is Thai.

## No build step — in-browser Babel (read this first)
There is **no bundler, no package.json, no npm, no tests, no lint**. `index.html` loads React 18 + `@babel/standalone` from CDN, then loads every source file as `<script type="text/babel" src="app/xxx.jsx?v=DATE">`. Babel transpiles JSX **in the browser** at page load.

Consequences:
- Every top-level `function`/`const` in a `.jsx` is a **global** shared across all files — there are **no imports/exports**. (`fmtNum`, `Modal`, `WTPData`, `WTPOverride`, `categorizePayable`, etc. are all global.)
- **Adding a new `.jsx` → add a `<script type="text/babel">` tag in `index.html`.**
- **Editing any `.jsx`/`.js`/`.css` → bump its `?v=` query in `index.html`** (e.g. `?v=20260609a` → `...b`). This is the cache-bust; without it, returning browsers serve the cached old file even after deploy. **Every edit pairs with a `?v=` bump.**

## Run / preview locally
Must be served over **HTTP** (not `file://`) — it fetches ~25 separate `.jsx`.
- `python -m http.server 8000` from repo root, open `http://localhost:8000` (entry = **`index.html`**). No Node on this machine.
- `.claude/launch.json` has an `http-server` config (port 8000) for preview tooling.
- The app has a **login gate**: a valid `wtp-session` in `localStorage` is required; data loads from the synced Sheet (cached in `localStorage` key `wtp-fin-data-v8`). To preview without real login, inject a session via the page console.

## Deploy = `git push` to `master` → GitHub Pages
Live at **https://patima-fin.github.io/waterpog-fin/** — GitHub Pages serves the **`master`** branch. **Changes are only visible after pushing to `master`** (there is no local→live path). The `Netlify` steps in `SETUP.md` and `netlify.toml` are **stale** — hosting is GitHub Pages. HTML entry is **`index.html`** (the older `Financial Dashboard.html` is not the live entry).

**Push checklist (every push):** bump `?v=` of each edited file in `index.html` → **update this `CLAUDE.md`** (per repo rule below) → commit → `git push origin master`.

## Architecture
- **`app/app.jsx`** — root component + **hash router** (`location.hash` → route key → page component), `data`/`setData` state, login gate (`currentUser` from `wtp-session`), sidebar/topbar.
- **`app/data.js`** — `window.WTPData`: `load()` (reads `localStorage` cache `wtp-fin-data-v8`, else seed), `save()`, `subscribe()`, `forceSyncNow()`, `refreshFromServer()`. Holds seed/mock data. `app/config.js` defines `window.WTP_CONFIG` (`APPS_SCRIPT_URL`, `AUTO_REFRESH_MS`, bootstrap `USERS`).
- **`app/data_sync.js`** — Google Sheets sync layer: polling (hot/cold), grace windows, anti-clobber / anti-wedge guards, row-level writes. Hardened repeatedly against data-loss (see `git log` `fix(sync)`).
- **`apps_script/Code.gs`** — the backend, pasted into Google Apps Script bound to the Sheet (`Code.standalone.gs` = standalone variant, `PnL.additions.gs` = extra). Server-side guards reject emptying/halving any table.
- **`app/components.jsx`** — shared UI globals: `Modal`, `Icon`, `Badge`, `KpiTile`, `EditableNumber`, formatters `fmtNum`/`fmtMoney`/`fmtDate`.
- **`app/page_*.jsx`** — one file per page (`page_cashflow`, `page_bank_diary`, `page_debt`, `page_debt_ledger`, `page_daily_balance`, `page_invoices`, `page_warroom_p1/p2`, `page_pnl`, `page_budget`, `page_projects`, `page_receipts`, `page_checks`, `page_users`, `page_audit_log`, `page_sts_*`, `page_interest_calc`, `page_data_extras`). Plus `app/charts.jsx`, root `tweaks-panel.jsx`.
- **`staging/`** — one-off `.tsv` import data + PowerShell build scripts (not part of the running app).

## Data model & overrides
- Entity tables: `bankAccounts`, `payables` (AP), `pvVouchers` (PV), `forecastEntries`, `invoices` (IV), `receipts`, `checks`, `debtMaster`, `debtLedger`, `bankEntries`, `bankTransfers`, `cashflowSnapshots`, `projects`, `users`.
- **`WTPOverride`** — a synced key→number KV store (`data.manualOverrides`) for UI tweaks that must NOT mutate backend entity tables: cashflow edits (`cf.*`), manual-paid flags (`cf.paidAp.<vchno>`), per-PV category (`cf.pvCat.<PL_PV_No>`), IV plan-lock (`*.ivPlan.*`). API: `resolve(key, fallback)`, `set`, `clear`, `has`.
- **Roles**: `viewer`/`owner` = read-only (`_wtpRoleIsReadOnly()` true, `WTPAuth.can('canEdit')` false); `manager`/`staff` can edit. Gate all edit UI behind `canEdit`.

## Conventions & gotchas
- **Cache-bust `?v=`** on every edit (see above) — easiest thing to forget, breaks deploys silently.
- Sync is **last-write-wins per entity** across users; many guards stop accidental mass-delete/clobber. Never push a stale-low or emptied table. Clearing a field over sync requires it in `CLEARABLE_FIELDS` / `mergeRowKeepSheetForEmpty` (else it bounces back).
- Some date fields are **DD/MM/YYYY (Thai)** — normalize to ISO before `new Date()` or months flip.
- Cashflow categories (หมวด 1-4): `categorizePayable(ap)` / `categorizeForecastEntry(fe)`, plus vendor→category map `cfVendorCat` (localStorage `wtp-cf-vendor-cat`, e.g. ลีซ อิท → 3) and per-PV override `cf.pvCat.<PL_PV_No>`.
- Cashflow IV forecast excludes already-received IVs (`ivIsPaid`); a day-1 "plan lock" freezes the monthly baseline so PLAN doesn't shrink as IVs get paid.
- **AP paid via PV ⇒ drop its forecast.** An AP whose number matches a `pvVouchers.AP_No` is "paid". Cashflow uses `buildPaidVchnoSet`/`isApPaid`; **Bank Diary** mirrors this via a global `paidApSet` (built from `pvVouchers.AP_No`) applied in **both** the account card (`bdBuildAccountView`) **and** the forecast panel (`BDForecastPanel`) — filters out any forecast (ประมาณการ) whose `REF_DOC ∈ paidApSet` so the real PV row represents the outflow (else the plan lingers / double-counts vs the already-reduced BALANCE). Both spots must stay in sync when touching forecast logic.
- **AP amount = net (`netpayment`).** Bank Diary `bdNormAP` and the AP panel show `netpayment` (ยอดสุทธิ), falling back `Amount → net_new → Balance_Amount1` — matches Cashflow's `Number(ap.netpayment || ap.Amount)`. Don't show `Balance_Amount1` (ยอดคงเหลือ) as the AP amount.
- **Sortable+filterable tables**: reuse the shared `FilterableColHeader` + `ColFilterDropdown` (in `components.jsx`) with parent-owned `colFilters`/`openCol` state and a `getValue(row, colKey)` (see [[colfilter-getvalue-convention]] — must be `(row, key)`). Used by `page_invoices` and the Bank Diary AP panel. Bank Diary account-card footer shows **net ending balance** (`base + visIn − visOut` over the shown period), not lowest-balance; overdue-checks modal rows expand to a detail panel; ReconcilePanel is column-sortable.
- **Bank Diary card = period-scoped; everything respects the selected period (`periodEnd`), never a fixed 7-day window.** Shortage alert `isShort = shortInPeriod` (red border/badge/"ต้องเติมเงิน" strip + the `shortAccounts` KPI) — NOT `shortNear`; badge reads "ไม่พอในช่วง `periodLabel`". The "📆 ภายใน 7 วัน" chip only shows when `next7 <= periodEnd` (hidden for sub-7-day views like "สัปดาห์นี้"). When changing alerts, keep them period-based or they "leak" next-week items into a this-week view.
- **Save card as PNG** (`BankAccountCard` 📷 button): `html2canvas-pro` (already loaded in `index.html`, global `window.html2canvas`) on `cardRef`; `ignoreElements` skips `[data-no-capture="1"]` (the button itself); output is **cropped to the `[data-capture-end="1"]` footer bottom** + a small pad and accent finish line (red if `netEnding<0`, green if ≥0) so it doesn't look torn. Same html2canvas pattern as `page_daily`/`page_invoices`/`page_pnl`.
- **Transfer-item label is direction-aware**, computed from the leg's own direction — NOT `bankEntry.description` (the stored note can be the wrong-side "โอนเงินไป …" on both legs). `bdBuildAccountView` takes a `transferInfoByRef` (transferRef → {fromNo/fromBank, toNo/toBank}, built from `transferPairs` + `accounts`); inflow leg → "รับโอนจาก «from»", outflow → "โอนเงินไป «to»". A genuine user note (description not starting with "โอนเงินไป"/"รับโอนจาก") is kept as the item `remark`.

## Repo rule: keep CLAUDE.md current
**Every time you `git push`, update this `CLAUDE.md`** to reflect anything that changed (architecture, conventions, new pages, gotchas). Treat it as part of the push, like the `?v=` bump.
