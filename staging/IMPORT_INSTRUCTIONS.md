# Import Instructions — paste TSVs into Google Sheet

This folder contains pre-cleaned TSV files ready to paste into the
corresponding tabs of **Water POG Financial DB** Google Sheet.

## Pre-step: update Apps Script & run `ensureV2Headers()`

The `invoices` and `checks` sheets have **OLD headers** from v1 that
are shorter than the new v2 schema. We need to append the missing
column headers before pasting data.

1. Open **Apps Script editor** (Water POG Backend v2)
2. In `Code.gs`, find function `ensureV2Headers` (added in v2.1 — bottom of file)
3. If you don't see it, re-paste the updated `Code.standalone.gs`
   from `apps_script/Code.standalone.gs` and **Ctrl+S**
4. Dropdown → select `ensureV2Headers` → ▶ **Run**
5. Check Logger output. Should show something like:
   `invoices: appended 13 col(s): projectCode, projectName, ...`
   `checks: already up to date`
6. No re-deploy needed — this is a one-shot setup function.

---

## Paste each TSV (5 files)

For each file below:

1. Open the `.tsv` file in **Notepad** (or VS Code) — make sure encoding is UTF-8
2. **Ctrl+A → Ctrl+C** (select all, copy)
3. In Google Sheet, switch to the target tab
4. **Click cell A2** (NOT A1 — A1 has headers)
5. **Ctrl+V** to paste
6. If Sheets asks about splitting: choose **"Split text into columns"** → **Tab**

### Files

| TSV file              | Target tab      | Rows  |
|-----------------------|-----------------|-------|
| `bankTransfers.tsv`   | `bankTransfers` | 9     |
| `checks.tsv`          | `checks`        | 258   |
| `invoices.tsv`        | `invoices`      | 701   |
| `receipts.tsv`        | `receipts`      | 684   |
| `debtMaster.tsv`      | `debtMaster`    | 127   |
| `debtLedger.tsv`      | `debtLedger`    | 3,998 |

---

## After all pastes — verify

1. Open the web app: <https://patima-fin.github.io/waterpog-fin/>
2. Hard refresh: **Ctrl+Shift+R**
3. Check that pages now show real data:
   - `Bank Diary` → should show transfers
   - `เช็คจ่ายล่วงหน้า` → should show 258 checks
   - `ใบแจ้งหนี้` → should show 701 invoices
   - `ภาระหนี้ทั้งหมด` → should show debt contracts
4. Report any pages that look broken — I'll fix the page code next.

---

## If pasting fails

- **Thai shows as ????** → TSV opened wrong encoding. Re-open as UTF-8 in Notepad.
- **All data in column A** → Sheets didn't split by tab. Try:
  - **File → Open** the TSV directly in Google Sheets, then copy from there
  - Or **Data → Split text to columns** after pasting, choose Tab as separator
- **"Sheet 'invoices' doesn't exist"** → re-run `setupV2Sheets()` in Apps Script
