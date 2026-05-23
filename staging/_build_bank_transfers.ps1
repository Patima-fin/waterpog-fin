# Build bankTransfers.tsv from RAW_BANK_TRANSFER.xlsx
# Output: data-only rows (no header) ready to paste at A2 of bankTransfers sheet.

$src = 'G:\Shared drives\Finance Waterpog\Dashboard Finance\RAW_BANK_TRANSFER.xlsx'
$out = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\bankTransfers.tsv'

function ExcelSerialToIso($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse($v, [ref]$n)) {
    if ($n -gt 20000 -and $n -lt 80000) {
      # Looks like an Excel date serial. Convert: Excel epoch = 1899-12-30 (accounts for 1900 leap bug)
      $d = (Get-Date '1899-12-30').AddDays($n)
      return $d.ToString('yyyy-MM-dd')
    }
  }
  return [string]$v
}

function NewId() {
  return 'bt_' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($src, 0, $true)
$ws = $wb.Worksheets.Item(1)
$used = $ws.UsedRange
$rows = $used.Rows.Count
$cols = $used.Columns.Count

# Target column order (matches ENTITY_HEADERS.bankTransfers in Code.standalone.gs)
# id, maincode, acct_no, PL_PV_No, paytype, Type_of_Pmt, Payee, paydate,
# Document_No, Chq_No, Chq_Date, Bank_AC, Net_Amount, exchange, data_ty, remark
# Source columns are in the SAME order from column 1-15, just need to prepend id.
# Date columns in source: 7 (paydate), 10 (Chq_Date)

$out_lines = @()
for ($r = 2; $r -le $rows; $r++) {
  $vals = @()
  $vals += NewId   # id
  for ($c = 1; $c -le 15; $c++) {
    $v = $used.Cells.Item($r, $c).Value2
    if ($null -eq $v) { $v = '' }
    if ($c -eq 7 -or $c -eq 10) {
      $v = ExcelSerialToIso $v
    }
    # Strip trailing whitespace from text values
    if ($v -is [string]) { $v = $v.Trim() }
    $vals += [string]$v
  }
  $out_lines += ($vals -join "`t")
}

$wb.Close($false)
$excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

# Write UTF-8 with BOM so Thai displays correctly when pasting
$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($out, ($out_lines -join "`r`n"), $enc)

Write-Output "Wrote $($out_lines.Count) rows to $out"
