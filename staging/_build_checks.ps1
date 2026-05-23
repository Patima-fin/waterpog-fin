# Build checks.tsv from ทะเบียนคุมเช็คจ่ายทุกแบงค์.xlsx
# Map source sheet "ทะเบียนคุมเช็ค - ทุกแบงค์" → checks schema.
# Source columns: เลขที่เช็ค | เช็คธนาคาร | หักบัญชี | วันที่จ่ายเช็ค | เช็คลงวันที่ |
#                จ่ายให้ | จำนวนเงิน | สัญญาเงินกู้เลชที่ | หมายเหตุประกอบ |
#                วันที่จ่ายเงิน | วันที่ได้รับเช็คคืน | ประเภทเช็ค | Column1 | สถานะเช็ค
# Target schema (ENTITY_HEADERS.checks):
#   id, checkNo, checkDate, payee, amount, bankName, accountNo,
#   referenceNo, linkedProjectCode, status, note

# Resolve Thai filename via wildcard to avoid encoding issues with PowerShell script parsing.
$src = (Get-ChildItem 'G:\Shared drives\Finance Waterpog\Dashboard Finance\*.xlsx' | Where-Object { $_.Name -like '*คุม*' -and $_.Name -like '*เช็ค*' } | Select-Object -First 1).FullName
if (-not $src) { Write-Error 'Source file not found'; exit 1 }
Write-Output "Source: $src"
$out = 'G:\Shared drives\Finance Waterpog\WebAPP - FIN\staging\checks.tsv'

function ExcelSerialToIso($v) {
  if ($null -eq $v -or $v -eq '') { return '' }
  $n = $null
  if ([double]::TryParse($v, [ref]$n)) {
    if ($n -gt 20000 -and $n -lt 80000) {
      $d = (Get-Date '1899-12-30').AddDays($n)
      return $d.ToString('yyyy-MM-dd')
    }
  }
  return [string]$v
}
function NewId() { return 'chk_' + ([guid]::NewGuid().ToString('N').Substring(0,8)) }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($src, 0, $true)
# Find target sheet by partial match
$ws = $null
foreach ($s in $wb.Worksheets) {
  if ($s.Name -like '*ทุกแบงค์*' -or $s.Name -like '*ทะเบียนคุมเช็ค - ทุก*') { $ws = $s; break }
}
if (-not $ws) {
  Write-Output 'Sheet names available:'
  $wb.Worksheets | ForEach-Object { Write-Output ('  - ' + $_.Name) }
  $wb.Close($false); $excel.Quit() | Out-Null
  Write-Error 'Target sheet not found'; exit 1
}
Write-Output ("Using sheet: " + $ws.Name)
$used = $ws.UsedRange
$rows = $used.Rows.Count

$out_lines = @()
$count = 0
for ($r = 2; $r -le $rows; $r++) {
  $checkNo = $used.Cells.Item($r, 1).Value2
  if ($null -eq $checkNo -or $checkNo -eq '') { continue }
  $bank      = $used.Cells.Item($r, 2).Value2
  $acctNo    = $used.Cells.Item($r, 3).Value2
  $issueDate = ExcelSerialToIso $used.Cells.Item($r, 4).Value2
  $checkDate = ExcelSerialToIso $used.Cells.Item($r, 5).Value2
  $payee     = $used.Cells.Item($r, 6).Value2
  $amount    = $used.Cells.Item($r, 7).Value2
  $loanRef   = $used.Cells.Item($r, 8).Value2
  $remark    = $used.Cells.Item($r, 9).Value2
  $payDate   = ExcelSerialToIso $used.Cells.Item($r,10).Value2
  $returnDate= ExcelSerialToIso $used.Cells.Item($r,11).Value2
  $checkType = $used.Cells.Item($r,12).Value2
  $status    = $used.Cells.Item($r,14).Value2

  # Build note that combines remark, type, issue/pay/return dates that don't fit schema
  $noteParts = @()
  if ($checkType) { $noteParts += "ประเภท: $checkType" }
  if ($remark)    { $noteParts += "หมายเหตุ: $remark" }
  if ($loanRef)   { $noteParts += "สัญญา: $loanRef" }
  if ($issueDate) { $noteParts += "วันจ่ายเช็ค: $issueDate" }
  if ($payDate)   { $noteParts += "วันจ่ายเงิน: $payDate" }
  if ($returnDate){ $noteParts += "วันรับเช็คคืน: $returnDate" }
  $note = ($noteParts -join ' | ')

  $vals = @(
    (NewId),
    [string]$checkNo,
    $checkDate,
    [string]$payee,
    [string]$amount,
    [string]$bank,
    [string]$acctNo,
    [string]$loanRef,
    '',                # linkedProjectCode - leave empty for now
    [string]$status,
    $note
  ) | ForEach-Object { if ($_ -is [string]) { $_.Trim() } else { [string]$_ } }
  $out_lines += ($vals -join "`t")
  $count++
}

$wb.Close($false)
$excel.Quit() | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect() | Out-Null

$enc = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($out, ($out_lines -join "`r`n"), $enc)
Write-Output "Wrote $count rows to $out"
