# Debt transformer v2 — bulk UsedRange.Value2 read (50-100x faster)
$outMaster = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\debtMaster.tsv'
$outLedger = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\debtLedger.tsv'

$jobs = @(
  @{ size = 6631487;  category = 'WCI';       currency = 'THB' },
  @{ size = 57432;    category = 'Non-WCI';   currency = 'THB' },
  @{ size = 83606;    category = 'กรรมการ';    currency = 'THB' },
  @{ size = 57735;    category = 'LockWood';  currency = 'THB' },
  @{ size = 489959;   category = 'Zigo';      currency = 'USD' },
  @{ size = 21584;    category = 'Employyim'; currency = 'THB' }
)

$folder = 'G:\Shared drives\Finance Waterpog\Dashboard Finance'
$allFiles = Get-ChildItem -Path $folder -Filter '*.xlsx' -File

$ThaiMonths = @{
  'มกราคม'=1; 'กุมภาพันธ์'=2; 'มีนาคม'=3; 'เมษายน'=4; 'พฤษภาคม'=5; 'มิถุนายน'=6
  'กรกฎาคม'=7; 'สิงหาคม'=8; 'กันยายน'=9; 'ตุลาคม'=10; 'พฤศจิกายน'=11; 'ธันวาคม'=12
}

function CleanStr($v) {
  if ($null -eq $v) { return '' }
  return (([string]$v) -replace "[`t`r`n]", ' ').Trim()
}
function NumStr($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) { return [string]$n }
  return ''
}
function ExcelSerialToIso($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) {
    if ($n -gt 20000 -and $n -lt 80000) { return (Get-Date '1899-12-30').AddDays($n).ToString('yyyy-MM-dd') }
  }
  $s = [string]$v
  if ($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
    try { return ([datetime]::ParseExact($s,'d/M/yyyy',$null)).ToString('yyyy-MM-dd') } catch {}
  }
  return $s
}
function NewMid() { return 'dm_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }
function NewLid() { return 'dl_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }

$masterLines = New-Object System.Collections.Generic.List[string]
$ledgerLines = New-Object System.Collections.Generic.List[string]
$sheetsProcessed = 0
$sheetsSkipped = 0

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false

foreach ($job in $jobs) {
  $file = $allFiles | Where-Object { $_.Length -eq $job.size } | Select-Object -First 1
  if (-not $file) { Write-Output ("[SKIP] No file size " + $job.size); continue }
  Write-Output ("[FILE] " + $job.category + ' ← ' + $file.Name)
  $wb = $excel.Workbooks.Open($file.FullName, 0, $true)

  $sheetCount = $wb.Worksheets.Count
  for ($si = 1; $si -le $sheetCount; $si++) {
    $ws = $wb.Worksheets.Item($si)
    $sheetName = $ws.Name
    if ($sheetName -notmatch '^\s*\d+\s*\.') { $sheetsSkipped++; continue }

    $used = $ws.UsedRange
    $rowCount = $used.Rows.Count
    $colCount = $used.Columns.Count
    if ($rowCount -lt 7) { $sheetsSkipped++; continue }

    # BULK READ — single COM call returning 2D array
    $arr = $used.Value2
    if ($null -eq $arr) { $sheetsSkipped++; continue }
    # PowerShell COM arrays are 1-indexed [row, col]

    # Probe top-left for borrower/contract info
    $borrower   = CleanStr $arr[2, 1]
    $vaonGen    = $null;  if ($colCount -ge 4) { $vaonGen   = $arr[3, 4] }
    $intRate    = $null;  if ($colCount -ge 4) { $intRate   = $arr[4, 4] }
    $contractNo = ''
    if ($colCount -ge 12) { $contractNo = CleanStr $arr[4, 12] }
    if (-not $contractNo -and $colCount -ge 13) { $contractNo = CleanStr $arr[4, 13] }

    $rcvStr = CleanStr $arr[2, 4]
    $receiveDate = ''
    if ($rcvStr -match '(\d{1,2})/(\d{1,2})/(\d{4})') {
      try { $receiveDate = ([datetime]::ParseExact($Matches[0],'d/M/yyyy',$null)).ToString('yyyy-MM-dd') } catch {}
    }
    $duration = ''
    if ($colCount -ge 4) { $duration = CleanStr $arr[5, 4] }

    # Find header row by scanning for "Month" in col 1 or "Principal" in col 4
    $headerRow = 0
    $maxProbe = [Math]::Min(15, $rowCount)
    for ($probe = 5; $probe -le $maxProbe; $probe++) {
      $c1 = CleanStr $arr[$probe, 1]
      $c4 = ''; if ($colCount -ge 4) { $c4 = CleanStr $arr[$probe, 4] }
      if ($c1 -eq 'Month' -or $c4 -eq 'Principal') { $headerRow = $probe; break }
    }
    if (-not $headerRow) { $sheetsSkipped++; continue }

    if (-not $contractNo -or $contractNo -eq '-') {
      $contractNo = $job.category + '-' + ($sheetName -replace '\s', '')
    }
    $status = if ($sheetName -match '\(ปิด\)|ยกเลิก') { 'Close' } else { 'Active' }

    # ── debtMaster row ────────────────────────────────────────
    $mCells = @(
      (NewMid), $job.category, $contractNo, $borrower, $status,
      '', '',
      $receiveDate, '', '', '',
      (NumStr $vaonGen), (NumStr $intRate), $job.currency,
      $receiveDate, '',
      (NumStr $vaonGen), '', '',
      '', '', $duration
    )
    $mCells = $mCells | ForEach-Object { CleanStr $_ }
    $masterLines.Add($mCells -join "`t") | Out-Null

    # ── debtLedger rows ───────────────────────────────────────
    for ($r = $headerRow + 1; $r -le $rowCount; $r++) {
      $monthTh = CleanStr $arr[$r, 1]
      if (-not $monthTh) { continue }
      if (-not $ThaiMonths.ContainsKey($monthTh)) { continue }
      $monthN = $ThaiMonths[$monthTh]
      $yearN  = '';  if ($colCount -ge  3) { $yearN  = NumStr $arr[$r, 3] }
      $prin   = '';  if ($colCount -ge  4) { $prin   = NumStr $arr[$r, 4] }
      $iRate  = '';  if ($colCount -ge  5) { $iRate  = NumStr $arr[$r, 5] }
      $days   = '';  if ($colCount -ge  6) { $days   = NumStr $arr[$r, 6] }
      $intAmt = '';  if ($colCount -ge  7) { $intAmt = NumStr $arr[$r, 7] }
      $inst   = '';  if ($colCount -ge  8) { $inst   = NumStr $arr[$r, 8] }
      $pPaid  = '';  if ($colCount -ge  9) { $pPaid  = NumStr $arr[$r, 9] }
      $outst  = '';  if ($colCount -ge 10) { $outst  = NumStr $arr[$r,10] }
      $payDt  = '';  if ($colCount -ge 11) { $payDt  = ExcelSerialToIso $arr[$r,11] }
      $nNote  = '';  if ($colCount -ge 12) { $nNote  = CleanStr $arr[$r,12] }

      $lCells = @(
        (NewLid), $contractNo, $yearN, [string]$monthN,
        $prin, $iRate, $days, $intAmt,
        $inst, $pPaid, $outst, $payDt, $nNote
      )
      $lCells = $lCells | ForEach-Object { CleanStr $_ }
      $ledgerLines.Add($lCells -join "`t") | Out-Null
    }
    $sheetsProcessed++
  }
  $wb.Close($false)
  Write-Output ("       processed so far: master=" + $masterLines.Count + " ledger=" + $ledgerLines.Count)
}

$excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($outMaster, ($masterLines -join "`r`n"), $enc)
[System.IO.File]::WriteAllText($outLedger, ($ledgerLines -join "`r`n"), $enc)

Write-Output ''
Write-Output '=== SUMMARY ==='
Write-Output ("Sheets processed: " + $sheetsProcessed)
Write-Output ("Sheets skipped:   " + $sheetsSkipped)
Write-Output ("debtMaster rows:  " + $masterLines.Count + " → " + $outMaster)
Write-Output ("debtLedger rows:  " + $ledgerLines.Count + " → " + $outLedger)
