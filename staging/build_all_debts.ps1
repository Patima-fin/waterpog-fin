# Comprehensive debt rebuild — outputs debtMaster_full.tsv + debtEvents_full.tsv
# Processes ALL 9+ source files and produces a clean normalized set.
#
# debtMaster: 1 row per unique contract, NO JSON columns (22 cols)
# debtEvents: 1 row per drawdown/repayment event (7 cols)
#
# For categories where source data is per-contract aggregated (WCI investor,
# Non-WCI, กรรมการ, LockWood, Zigo, Employyim, Lease IT), the primary
# drawdown goes into debtMaster; no debtEvents generated (user adds manually
# when needed).
#
# For STS source (which has explicit multi-drawdown cols), generate
# debtEvents rows for any 2nd+ drawdowns of STS and WCI.

$folder  = 'G:\Shared drives\Finance Waterpog\Dashboard Finance'
$staging = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging'
$outMaster = "$staging\debtMaster_full.tsv"
$outEvents = "$staging\debtEvents_full.tsv"

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
function NewEid() { return 'ev_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }
function S($v) { if ($null -eq $v) { return '' }; return (([string]$v) -replace "[`t`r`n]", ' ').Trim() }
function N($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) { return [string]$n }
  return ''
}
function MasterRow {
  param($id, $category, $contractNo, $borrower, $status, $bankName, $accountNo,
        $startDate, $endDate, $termMonths, $maturityDate, $principal, $intRate,
        $currency, $receiveDate, $payDate, $principalIn, $principalOut, $balance,
        $projectCode, $projectName, $note)
  return @($id, $category, $contractNo, $borrower, $status, $bankName, $accountNo,
           $startDate, $endDate, $termMonths, $maturityDate, $principal, $intRate,
           $currency, $receiveDate, $payDate, $principalIn, $principalOut, $balance,
           $projectCode, $projectName, $note) | ForEach-Object { S $_ }
}
function EventRow {
  param($contractId, $contractNo, $eventType, $eventDate, $amount, $note)
  return @((NewEid), $contractId, $contractNo, $eventType, $eventDate, $amount, $note) | ForEach-Object { S $_ }
}

$ThaiMonths = @{
  'มกราคม'=1; 'กุมภาพันธ์'=2; 'มีนาคม'=3; 'เมษายน'=4; 'พฤษภาคม'=5; 'มิถุนายน'=6
  'กรกฎาคม'=7; 'สิงหาคม'=8; 'กันยายน'=9; 'ตุลาคม'=10; 'พฤศจิกายน'=11; 'ธันวาคม'=12
}

$masterLines = New-Object System.Collections.Generic.List[string]
$eventLines  = New-Object System.Collections.Generic.List[string]

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false

# ── Job 1: 6 individual loan files (WCI / Non-WCI / กรรมการ / LockWood / Zigo / Employyim) ──
$indivJobs = @(
  @{ size = 6631487;  category = 'WCI';       currency = 'THB' },
  @{ size = 57432;    category = 'Non-WCI';   currency = 'THB' },
  @{ size = 83606;    category = 'กรรมการ';   currency = 'THB' },
  @{ size = 57735;    category = 'LockWood';  currency = 'THB' },
  @{ size = 489959;   category = 'Zigo';      currency = 'USD' },
  @{ size = 21584;    category = 'Employyim'; currency = 'THB' }
)
$allFiles = Get-ChildItem -Path $folder -Filter '*.xlsx' -File
foreach ($job in $indivJobs) {
  $file = $allFiles | Where-Object { $_.Length -eq $job.size } | Select-Object -First 1
  if (-not $file) { Write-Output ("[skip] no file for " + $job.category); continue }
  Write-Output ("[INDIV] " + $job.category)
  $wb = $excel.Workbooks.Open($file.FullName, 0, $true)
  foreach ($ws in $wb.Worksheets) {
    $name = $ws.Name
    if ($name -notmatch '^\s*\d+\s*\.') { continue }
    $used = $ws.UsedRange
    if ($used.Rows.Count -lt 7) { continue }
    $arr = $used.Value2
    $borrower   = S $arr[2, 1]
    $vaonGen    = N $arr[3, 4]
    $intRate    = N $arr[4, 4]
    $contractNo = S $arr[4, 12]
    if (-not $contractNo) { $contractNo = S $arr[4, 13] }
    $rcvStr = S $arr[2, 4]
    $receiveDate = ''
    if ($rcvStr -match '(\d{1,2})/(\d{1,2})/(\d{4})') {
      try { $receiveDate = ([datetime]::ParseExact($Matches[0],'d/M/yyyy',$null)).ToString('yyyy-MM-dd') } catch {}
    }
    $duration = S $arr[5, 4]
    if (-not $contractNo -or $contractNo -eq '-') {
      $contractNo = $job.category + '-' + ($name -replace '\s', '')
    }
    $status = 'Active'
    if ($name -match '\(ปิด\)|ยกเลิก') { $status = 'Close' }
    $id = NewMid
    $masterLines.Add((MasterRow $id $job.category $contractNo $borrower $status `
      '' '' $receiveDate '' '' '' $vaonGen $intRate $job.currency `
      $receiveDate '' $vaonGen '' '' '' '' $duration) -join "`t") | Out-Null
  }
  $wb.Close($false)
}

# ── Job 2: Lease IT — สรุปรวม sheet ──
$litFile = $allFiles | Where-Object { $_.Length -eq 13373334 } | Select-Object -First 1
if ($litFile) {
  Write-Output "[LEASEIT]"
  $wb = $excel.Workbooks.Open($litFile.FullName, 0, $true)
  $ws = $wb.Worksheets.Item('สรุปรวม')
  $arr = $ws.UsedRange.Value2
  $rows = $ws.UsedRange.Rows.Count
  for ($r = 6; $r -le $rows; $r++) {
    $contractNo = S $arr[$r, 2]
    $jobNo      = S $arr[$r, 3]
    $projName   = S $arr[$r, 4]
    if (-not $contractNo -and -not $jobNo) { continue }
    $rawStatus  = S $arr[$r, 6]
    $intRate    = N $arr[$r, 8]
    $startDate  = ExcelSerialToIso $arr[$r, 9]
    $endDate    = ExcelSerialToIso $arr[$r,10]
    $termDays   = N $arr[$r,12]
    $maturity   = ExcelSerialToIso $arr[$r,13]
    $rcvDate    = ExcelSerialToIso $arr[$r,15]
    $principal  = N $arr[$r,16]
    if (-not $principal -or [double]$principal -le 0) { continue }
    $status = 'Active'; if ($rawStatus -ne 'Active' -and $rawStatus -notlike '*Work*') { $status = 'Close' }
    if (-not $contractNo) { $contractNo = 'LIT-' + $jobNo }
    $id = NewMid
    $masterLines.Add((MasterRow $id 'ลีซอิท' $contractNo $projName $status `
      'บมจ.ลีซอิท' '' $startDate $endDate $termDays $maturity $principal $intRate 'THB' `
      $rcvDate '' $principal '' '' $jobNo $projName $rawStatus) -join "`t") | Out-Null
  }
  $wb.Close($false)
}

# ── Job 3: STS+WCI (2) sheet — 1 STS row + 1 WCI row per project + debtEvents for extras ──
$stsFile = $allFiles | Where-Object { $_.Name -like '*STS*' -or $_.Name -like '*โอนสิทธิ*' } | Select-Object -First 1
if ($stsFile) {
  Write-Output "[STS+WCI]"
  $wb = $excel.Workbooks.Open($stsFile.FullName, 0, $true)
  $ws = $wb.Worksheets.Item('STS+WCI (2)')
  $arr = $ws.UsedRange.Value2
  $rows = $ws.UsedRange.Rows.Count

  for ($r = 7; $r -le $rows; $r++) {
    $jobNo       = S $arr[$r, 2]
    $projectName = S $arr[$r, 3]
    if (-not $projectName) { continue }
    $rawStatus   = S $arr[$r, 4]
    $startDate   = ExcelSerialToIso $arr[$r, 9]
    $endDate     = ExcelSerialToIso $arr[$r,10]
    $contractNo  = S $arr[$r,11]
    if (-not $contractNo) { $contractNo = 'STS-' + $jobNo }
    $contractAmt = N $arr[$r,12]
    $status = 'Close'; if ($rawStatus -eq 'Active' -or $rawStatus -like '*Work*') { $status = 'Active' }

    # STS drawdowns: ครั้งที่ 1 (col 27/29), ครั้งที่ 2 (col 28/30)
    $stsD1 = ExcelSerialToIso $arr[$r,27]; $stsA1 = N $arr[$r,29]
    $stsD2 = ExcelSerialToIso $arr[$r,28]; $stsA2 = N $arr[$r,30]
    # Fallback if STS receive missing: use total
    if ((-not $stsA1 -or [double]$stsA1 -le 0) -and (-not $stsA2 -or [double]$stsA2 -le 0)) {
      $stsTotal = N $arr[$r,17]
      if ($stsTotal -and [double]$stsTotal -gt 0) {
        $stsD1 = ExcelSerialToIso $arr[$r,19]
        $stsA1 = $stsTotal
      }
    }

    # WCI drawdowns: ครั้งที่ 1-3 (dates col 19-21, amounts col 22-24)
    $wciD1 = ExcelSerialToIso $arr[$r,19]; $wciA1 = N $arr[$r,22]
    $wciD2 = ExcelSerialToIso $arr[$r,20]; $wciA2 = N $arr[$r,23]
    $wciD3 = ExcelSerialToIso $arr[$r,21]; $wciA3 = N $arr[$r,24]

    # ── Emit STS row ──
    if ($stsA1 -and [double]$stsA1 -gt 0) {
      $stsId = NewMid
      $masterLines.Add((MasterRow $stsId 'STS' $contractNo $projectName $status `
        '' '' $startDate $endDate '' '' $stsA1 '0.15' 'THB' `
        $stsD1 '' $stsA1 '' '' $jobNo $projectName ('STS โอนสิทธิ์ - มูลค่าสัญญา ' + $contractAmt)) -join "`t") | Out-Null
      # Additional STS drawdown
      if ($stsA2 -and [double]$stsA2 -gt 0) {
        $eventLines.Add((EventRow $stsId $contractNo 'drawdown' $stsD2 $stsA2 'STS ครั้งที่ 2') -join "`t") | Out-Null
      }
    }

    # ── Emit WCI-Project row ──
    if ($wciA1 -and [double]$wciA1 -gt 0) {
      $wciContractNo = $contractNo + '-WCI'
      $wciId = NewMid
      $masterLines.Add((MasterRow $wciId 'WCI-Project' $wciContractNo $projectName $status `
        '' '' $startDate $endDate '' '' $wciA1 '0.10' 'THB' `
        $wciD1 '' $wciA1 '' '' $jobNo $projectName ('WCI โอนสิทธิ์ (ผูกกับ STS=' + $contractNo + ')')) -join "`t") | Out-Null
      if ($wciA2 -and [double]$wciA2 -gt 0) {
        $eventLines.Add((EventRow $wciId $wciContractNo 'drawdown' $wciD2 $wciA2 'WCI ครั้งที่ 2') -join "`t") | Out-Null
      }
      if ($wciA3 -and [double]$wciA3 -gt 0) {
        $eventLines.Add((EventRow $wciId $wciContractNo 'drawdown' $wciD3 $wciA3 'WCI ครั้งที่ 3') -join "`t") | Out-Null
      }
    }

    # ── WCI repayment events (col 37-40) ──
    $repD1 = ExcelSerialToIso $arr[$r,37]; $repA1 = N $arr[$r,38]
    $repD2 = ExcelSerialToIso $arr[$r,39]; $repA2 = N $arr[$r,40]
    if (($repA1 -and [double]$repA1 -gt 0) -or ($repA2 -and [double]$repA2 -gt 0)) {
      # Need wciId — find the just-added WCI row's id (last WCI row)
      $wciIdLookup = (($masterLines[-1]) -split "`t")[0]
      if ($wciA1 -and [double]$wciA1 -gt 0) {
        if ($repA1 -and [double]$repA1 -gt 0) {
          $eventLines.Add((EventRow $wciIdLookup ($contractNo + '-WCI') 'repayment' $repD1 $repA1 'คืน WCI งวด 1') -join "`t") | Out-Null
        }
        if ($repA2 -and [double]$repA2 -gt 0) {
          $eventLines.Add((EventRow $wciIdLookup ($contractNo + '-WCI') 'repayment' $repD2 $repA2 'คืน WCI งวด 2') -join "`t") | Out-Null
        }
      }
    }
  }
  $wb.Close($false)
}

# ── Job 4: FS manual ──
$fsId = NewMid
$masterLines.Add((MasterRow $fsId 'FS' 'FS-001' 'เงินกู้ FS' 'Active' `
  '' '' '2026-02-20' '2027-03-20' '13' '2027-03-20' '10000000' '0.12' 'THB' `
  '2026-02-20' '' '10000000' '' '10000000' '' '' 'จ่ายดอกเบี้ย+เงินต้นรายเดือน 933,333.33') -join "`t") | Out-Null

$excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($outMaster, ($masterLines -join "`r`n"), $enc)
[System.IO.File]::WriteAllText($outEvents, ($eventLines -join "`r`n"), $enc)

Write-Output ""
Write-Output "=== SUMMARY ==="
Write-Output ("debtMaster rows: " + $masterLines.Count + " → " + $outMaster)
Write-Output ("debtEvents rows: " + $eventLines.Count + " → " + $outEvents)
Write-Output ""
Write-Output "Categories:"
$masterLines | ForEach-Object { ($_ -split "`t")[1] } | Group-Object | Sort-Object Count -Descending | Format-Table Count, Name -AutoSize
Write-Output "Event types:"
$eventLines | ForEach-Object { ($_ -split "`t")[3] } | Group-Object | Format-Table Count, Name -AutoSize
