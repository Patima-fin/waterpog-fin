# Build STS debt contracts → debtMaster.tsv (append-only batch)
# Source: สรุปรายการโอนสิทธิ์การรับเงิน STS 2567-2569.xlsx → sheet 'STS+WCI (2)'

$folder = 'G:\Shared drives\Finance Waterpog\Dashboard Finance'
$src = (Get-ChildItem -Path $folder -Filter '*.xlsx' -File | Where-Object { $_.Name -like '*STS*' -or $_.Name -like '*โอนสิทธิ*' } | Select-Object -First 1).FullName
Write-Output "Source: $src"

$out = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\debtMaster_sts.tsv'

function ExcelSerialToIso($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) {
    if ($n -gt 20000 -and $n -lt 80000) { return (Get-Date '1899-12-30').AddDays($n).ToString('yyyy-MM-dd') }
  }
  return [string]$v
}
function NewMid() { return 'dm_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }
function S($v) { if ($null -eq $v) { return '' }; return (([string]$v) -replace "[`t`r`n]", ' ').Trim() }
function N($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse([string]$v, [ref]$n)) { return [string]$n }
  return ''
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($src, 0, $true)
$ws = $wb.Worksheets.Item('STS+WCI (2)')
$arr = $ws.UsedRange.Value2
$rows = $ws.UsedRange.Rows.Count
Write-Output ("Sheet rows: " + $rows)

# Columns (from R5 header):
#  1=ลำดับ, 2=JOB No, 3=Project Name, 4=สถานะเงินกู้, 9=วันที่เริ่มสัญญา,
# 10=วันที่สิ้นสุดสัญญา, 11=เลขที่สัญญากู้ยืม STS, 12=มูลค่าเซ็นสัญญา,
# 16=จำนวนเงินกู้ WCI, 17=จำนวนเงินกู้ STS, 19=วันที่รับเงิน

# Output schema (debtMaster):
# id, debtCategory, contractNo, borrowerName, status,
# bankName, accountNo, startDate, endDate, termMonths, maturityDate,
# principalAmount, interestRate, currency,
# receiveDate, payDate, principalIn, principalOut, balance,
# projectCode, projectName, note

$out_lines = New-Object System.Collections.Generic.List[string]
$stsCount = 0
$wciAddCount = 0

for ($r = 7; $r -le $rows; $r++) {
  $jobNo       = S $arr[$r, 2]
  $projectName = S $arr[$r, 3]
  if (-not $projectName) { continue }
  $rawStatus   = S $arr[$r, 4]
  $startDate   = ExcelSerialToIso $arr[$r, 9]
  $endDate     = ExcelSerialToIso $arr[$r,10]
  $contractNo  = S $arr[$r,11]
  $contractAmt = N $arr[$r,12]
  $wciLoanAmt  = N $arr[$r,16]
  $stsLoanAmt  = N $arr[$r,17]
  $rcvDate1    = ExcelSerialToIso $arr[$r,19]

  # Determine status
  $status = if ($rawStatus -eq 'Active') { 'Active' } else { 'Close' }

  # ── STS row ──────────────────────────────────────────────
  if ($stsLoanAmt -and [double]$stsLoanAmt -gt 0) {
    $stsContractNo = if ($contractNo) { $contractNo } else { ('STS-' + $jobNo) }
    $note = "STS โอนสิทธิ์ - มูลค่าสัญญา $contractAmt"
    $stsCells = @(
      (NewMid), 'STS', $stsContractNo, $projectName, $status,
      '', '',
      $startDate, $endDate, '', '',
      $stsLoanAmt, '0.15', 'THB',
      $rcvDate1, '',
      $stsLoanAmt, '', '',
      $jobNo, $projectName, $note
    )
    $out_lines.Add(($stsCells | ForEach-Object { S $_ }) -join "`t") | Out-Null
    $stsCount++
  }
}

$wb.Close($false); $excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($out, ($out_lines -join "`r`n"), $enc)

Write-Output ""
Write-Output "=== SUMMARY ==="
Write-Output "STS contracts: $stsCount → $out"
Write-Output ""
Write-Output "=== Preview (first 3) ==="
Get-Content $out -Encoding UTF8 | Select-Object -First 3
