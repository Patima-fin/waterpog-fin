# Unified debt transformer — outputs debtMaster.tsv + debtLedger.tsv from 6 debt files.
# Processes per-person sheets (sheet name starts with a number like "1.", "23.", etc.)
# Skips summary sheets.
#
# Each person sheet uses the WCI template:
#   R2 col 1 : borrower name
#   R2 col 4+: contains "วันที่รับเงิน DD/MM/YYYY"  (or similar)
#   R3 col 4 : วงเงินกู้
#   R4 col 4 : อัตราดอกเบี้ย/ปี
#   R4 col12 : เลขที่สัญญา (sometimes col12 is the value, col11 is label)
#   R6       : header row (Month | "" | Year | Principal | Int. rate | Days | Int. amount | Installment | Principal paid | Outstanding | Payment Date | note)
#   R7+      : monthly data

param(
  [string]$OutMaster = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\debtMaster.tsv',
  [string]$OutLedger = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\debtLedger.tsv'
)

# File-size signatures (preferred over Thai paths) → category labels
$jobs = @(
  @{ size = 6631487;  category = 'WCI';        currency = 'THB' },
  @{ size = 57432;    category = 'Non-WCI';    currency = 'THB' },
  @{ size = 83606;    category = 'กรรมการ';     currency = 'THB' },
  @{ size = 57735;    category = 'LockWood';   currency = 'THB' },
  @{ size = 489959;   category = 'Zigo';       currency = 'USD' },
  @{ size = 21584;    category = 'Employyim';  currency = 'THB' }
)

$folder = 'G:\Shared drives\Finance Waterpog\Dashboard Finance'
$allFiles = Get-ChildItem -Path $folder -Filter '*.xlsx' -File

function ExcelSerialToIso($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse($v, [ref]$n)) {
    if ($n -gt 20000 -and $n -lt 80000) { return (Get-Date '1899-12-30').AddDays($n).ToString('yyyy-MM-dd') }
    if ($n -gt 1 -and $n -lt 80000 -and $n -ne [math]::Floor($n)) { } # fractional - leave as-is
  }
  $s = [string]$v
  if ($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
    try { return ([datetime]::ParseExact($s,'d/M/yyyy',$null)).ToString('yyyy-MM-dd') } catch {}
  }
  return $s
}
function NewMid() { return 'dm_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }
function NewLid() { return 'dl_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }
function S($v) { if ($null -eq $v) { return '' }; return (([string]$v) -replace "[`t`r`n]", ' ').Trim() }
function N($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) { return [string]$n }
  return ''
}

# Returns a thai month → number lookup
$ThaiMonths = @{
  'มกราคม'=1; 'กุมภาพันธ์'=2; 'มีนาคม'=3; 'เมษายน'=4; 'พฤษภาคม'=5; 'มิถุนายน'=6
  'กรกฎาคม'=7; 'สิงหาคม'=8; 'กันยายน'=9; 'ตุลาคม'=10; 'พฤศจิกายน'=11; 'ธันวาคม'=12
}

$masterLines = @()
$ledgerLines = @()
$masterCount = 0
$ledgerCount = 0
$sheetsProcessed = 0
$sheetsSkipped = 0

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false

foreach ($job in $jobs) {
  $file = $allFiles | Where-Object { $_.Length -eq $job.size } | Select-Object -First 1
  if (-not $file) { Write-Output ("[SKIP] No file with size $($job.size) for $($job.category)"); continue }
  Write-Output ("[FILE] $($job.category) ← $($file.Name)")
  $wb = $excel.Workbooks.Open($file.FullName, 0, $true)
  foreach ($ws in $wb.Worksheets) {
    $name = $ws.Name
    # Only process sheets starting with digits + dot (person sheets)
    if ($name -notmatch '^\s*\d+\s*\.') { $sheetsSkipped++; continue }
    $used = $ws.UsedRange
    if ($used.Rows.Count -lt 7) { $sheetsSkipped++; continue }

    # Probe for borrower / amounts in fixed positions
    $borrower    = S $used.Cells.Item(2, 1).Value2
    $vaonGen     = $used.Cells.Item(3, 4).Value2     # วงเงินกู้
    $intRate     = $used.Cells.Item(4, 4).Value2     # อัตราดอกเบี้ย/ปี
    $contractNo  = S $used.Cells.Item(4, 12).Value2  # เลขที่สัญญา
    if (-not $contractNo) { $contractNo = S $used.Cells.Item(4, 13).Value2 }
    $rcvDateStr  = S $used.Cells.Item(2, 4).Value2   # "วันที่รับเงิน DD/MM/YYYY"
    $receiveDate = ''
    if ($rcvDateStr -match '(\d{1,2})/(\d{1,2})/(\d{4})') {
      try { $receiveDate = ([datetime]::ParseExact($Matches[0],'d/M/yyyy',$null)).ToString('yyyy-MM-dd') } catch {}
    }
    $duration    = S $used.Cells.Item(5, 4).Value2   # ระยะเวลากู้ — free text

    # Find the header row by scanning rows 5..15 for "Month" or "Principal" cell
    $headerRow = 0
    for ($probe = 5; $probe -le 15; $probe++) {
      $c1 = S $used.Cells.Item($probe, 1).Value2
      $c4 = S $used.Cells.Item($probe, 4).Value2
      if ($c1 -eq 'Month' -or $c4 -eq 'Principal') { $headerRow = $probe; break }
    }
    if (-not $headerRow) { $sheetsSkipped++; continue }

    # If no contractNo from R4, use sheet name as fallback
    if (-not $contractNo -or $contractNo -eq '-') {
      # Take first 80 chars of borrower + sheet name as ref
      $contractNo = $job.category + '-' + ($name -replace '\s', '')
    }

    # Determine status: simple - if last outstanding row = 0, mark Close
    $status = if ($name -match '\(ปิด\)|ยกเลิก') { 'Close' } else { 'Active' }

    # ── debtMaster row ─────────────────────────────────────────
    $mId = NewMid
    $masterCells = @(
      $mId, $job.category, $contractNo, $borrower, $status,
      '', '',                       # bankName, accountNo (not on person sheet header)
      $receiveDate, '', '', '',     # startDate, endDate, termMonths, maturityDate
      (N $vaonGen), (N $intRate), $job.currency,
      $receiveDate, '',             # receiveDate, payDate
      (N $vaonGen), '', '',         # principalIn, principalOut, balance (compute later)
      '', '',                       # projectCode, projectName
      $duration                     # note
    )
    $masterCells = $masterCells | ForEach-Object { S $_ }
    $masterLines += ($masterCells -join "`t")
    $masterCount++

    # ── debtLedger rows (from headerRow+1 onward) ─────────────
    $maxR = $used.Rows.Count
    for ($r = $headerRow + 1; $r -le $maxR; $r++) {
      $monthTh   = S $used.Cells.Item($r, 1).Value2
      if (-not $monthTh) { continue }
      if (-not $ThaiMonths.ContainsKey($monthTh)) { continue }  # skip non-data rows
      $monthN    = $ThaiMonths[$monthTh]
      $yearN     = N $used.Cells.Item($r, 3).Value2
      $principal = N $used.Cells.Item($r, 4).Value2
      $iRate     = N $used.Cells.Item($r, 5).Value2
      $days      = N $used.Cells.Item($r, 6).Value2
      $intAmt    = N $used.Cells.Item($r, 7).Value2
      $install   = N $used.Cells.Item($r, 8).Value2
      $pPaid     = N $used.Cells.Item($r, 9).Value2
      $outst     = N $used.Cells.Item($r, 10).Value2
      $payDate   = ExcelSerialToIso $used.Cells.Item($r, 11).Value2
      $nNote     = S $used.Cells.Item($r, 12).Value2

      $lCells = @(
        (NewLid), $contractNo, $yearN, [string]$monthN,
        $principal, $iRate, $days, $intAmt,
        $install, $pPaid, $outst, $payDate, $nNote
      )
      $lCells = $lCells | ForEach-Object { S $_ }
      $ledgerLines += ($lCells -join "`t")
      $ledgerCount++
    }
    $sheetsProcessed++
  }
  $wb.Close($false)
}

$excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($OutMaster, ($masterLines -join "`r`n"), $enc)
[System.IO.File]::WriteAllText($OutLedger, ($ledgerLines -join "`r`n"), $enc)

Write-Output ''
Write-Output "=== SUMMARY ==="
Write-Output "Sheets processed:    $sheetsProcessed"
Write-Output "Sheets skipped:      $sheetsSkipped"
Write-Output "debtMaster rows:     $masterCount → $OutMaster"
Write-Output "debtLedger rows:     $ledgerCount → $OutLedger"
